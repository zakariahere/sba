# MyBatis Persistence Skill

**Purpose**: Patterns and best practices for MyBatis-based Spring Batch implementations.

---

## When to Use MyBatis

**Good fit**:
- Fine-grained SQL control needed
- Complex stored procedures
- Legacy database schemas
- Maximum performance required
- Dynamic SQL requirements

**Avoid when**:
- Simple CRUD operations (JPA simpler)
- Need for entity relationship management
- Rapid prototyping

---

## Dependencies

```xml
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>3.0.3</version>
</dependency>
<dependency>
    <groupId>org.mybatis</groupId>
    <artifactId>mybatis-spring</artifactId>
    <version>3.0.3</version>
</dependency>
```

---

## Reader Patterns

### MyBatisCursorItemReader (Recommended for Large Datasets)

```java
@Bean
@StepScope
public MyBatisCursorItemReader<SourceRecord> cursorReader(
        SqlSessionFactory sqlSessionFactory,
        @Value("#{jobParameters['processDate']}") String processDate) {

    return new MyBatisCursorItemReaderBuilder<SourceRecord>()
        .sqlSessionFactory(sqlSessionFactory)
        .queryId("{{package}}.mapper.SourceMapper.findPendingRecords")
        .parameterValues(Map.of("processDate", LocalDate.parse(processDate)))
        .build();
}
```

### MyBatisPagingItemReader (For Restartability)

```java
@Bean
@StepScope
public MyBatisPagingItemReader<SourceRecord> pagingReader(
        SqlSessionFactory sqlSessionFactory,
        @Value("#{jobParameters['status']}") String status) {

    return new MyBatisPagingItemReaderBuilder<SourceRecord>()
        .sqlSessionFactory(sqlSessionFactory)
        .queryId("{{package}}.mapper.SourceMapper.findByStatusPaged")
        .parameterValues(Map.of("status", status))
        .pageSize(1000)
        .build();
}
```

### Mapper Interface

```java
package {{package}}.mapper;

import org.apache.ibatis.annotations.*;
import org.apache.ibatis.cursor.Cursor;
import java.util.List;

@Mapper
public interface SourceMapper {

    // For cursor reader
    Cursor<SourceRecord> findPendingRecords(@Param("processDate") LocalDate processDate);

    // For paging reader
    List<SourceRecord> findByStatusPaged(
        @Param("status") String status,
        @Param("_skiprows") int offset,
        @Param("_pagesize") int limit
    );
}
```

### Mapper XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<mapper namespace="{{package}}.mapper.SourceMapper">

    <resultMap id="sourceRecordMap" type="{{package}}.dto.SourceRecord">
        <id property="id" column="id"/>
        <result property="field1" column="field1"/>
        <result property="field2" column="field2"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <select id="findPendingRecords" resultMap="sourceRecordMap" fetchSize="1000">
        SELECT id, field1, field2, created_at
        FROM source_table
        WHERE status = 'PENDING'
          AND process_date = #{processDate}
        ORDER BY id
    </select>

    <select id="findByStatusPaged" resultMap="sourceRecordMap">
        SELECT id, field1, field2, created_at
        FROM source_table
        WHERE status = #{status}
        ORDER BY id
        LIMIT #{_pagesize} OFFSET #{_skiprows}
    </select>

</mapper>
```

---

## Writer Patterns

### MyBatisBatchItemWriter

```java
@Bean
public MyBatisBatchItemWriter<TargetRecord> batchWriter(
        SqlSessionFactory sqlSessionFactory) {

    return new MyBatisBatchItemWriterBuilder<TargetRecord>()
        .sqlSessionFactory(sqlSessionFactory)
        .statementId("{{package}}.mapper.TargetMapper.insert")
        .assertUpdates(true)  // Verify all records inserted
        .build();
}
```

### Writer Mapper

```java
@Mapper
public interface TargetMapper {

    void insert(TargetRecord record);

    void update(TargetRecord record);

    void upsert(TargetRecord record);

    void batchInsert(@Param("list") List<TargetRecord> records);
}
```

### Writer Mapper XML

```xml
<mapper namespace="{{package}}.mapper.TargetMapper">

    <insert id="insert">
        INSERT INTO target_table (id, field1, field2, created_at)
        VALUES (#{id}, #{field1}, #{field2}, #{createdAt})
    </insert>

    <update id="update">
        UPDATE target_table
        SET field1 = #{field1},
            field2 = #{field2},
            updated_at = NOW()
        WHERE id = #{id}
    </update>

    <!-- PostgreSQL upsert -->
    <insert id="upsert">
        INSERT INTO target_table (id, field1, field2, updated_at)
        VALUES (#{id}, #{field1}, #{field2}, NOW())
        ON CONFLICT (id) DO UPDATE SET
            field1 = EXCLUDED.field1,
            field2 = EXCLUDED.field2,
            updated_at = NOW()
    </insert>

    <!-- Batch insert for high performance -->
    <insert id="batchInsert">
        INSERT INTO target_table (id, field1, field2, created_at)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.id}, #{item.field1}, #{item.field2}, #{item.createdAt})
        </foreach>
    </insert>

</mapper>
```

---

## Dynamic SQL Patterns

### Conditional Queries

```xml
<select id="findByDynamicCriteria" resultMap="recordMap">
    SELECT * FROM source_table
    <where>
        <if test="status != null">
            AND status = #{status}
        </if>
        <if test="startDate != null">
            AND created_at >= #{startDate}
        </if>
        <if test="endDate != null">
            AND created_at &lt;= #{endDate}
        </if>
        <if test="types != null and types.size() > 0">
            AND type IN
            <foreach collection="types" item="type" open="(" separator="," close=")">
                #{type}
            </foreach>
        </if>
    </where>
    ORDER BY id
</select>
```

### Choose/When/Otherwise

```xml
<select id="findByPriority" resultMap="recordMap">
    SELECT * FROM source_table
    WHERE status = 'PENDING'
    <choose>
        <when test="priority == 'HIGH'">
            AND importance >= 8
        </when>
        <when test="priority == 'MEDIUM'">
            AND importance BETWEEN 4 AND 7
        </when>
        <otherwise>
            AND importance &lt; 4
        </otherwise>
    </choose>
    ORDER BY importance DESC, id
</select>
```

---

## Stored Procedure Patterns

### Calling Stored Procedures

```xml
<select id="callProcessingProc" statementType="CALLABLE" resultMap="recordMap">
    {CALL process_batch_records(
        #{processDate, mode=IN, jdbcType=DATE},
        #{batchSize, mode=IN, jdbcType=INTEGER},
        #{resultCount, mode=OUT, jdbcType=INTEGER}
    )}
</select>
```

### Reader with Stored Procedure

```java
@Bean
@StepScope
public MyBatisCursorItemReader<ProcessedRecord> storedProcReader(
        SqlSessionFactory sqlSessionFactory) {

    Map<String, Object> params = new HashMap<>();
    params.put("processDate", LocalDate.now());
    params.put("batchSize", 1000);

    return new MyBatisCursorItemReaderBuilder<ProcessedRecord>()
        .sqlSessionFactory(sqlSessionFactory)
        .queryId("{{package}}.mapper.ProcMapper.callProcessingProc")
        .parameterValues(params)
        .build();
}
```

---

## Configuration

### application.yml

```yaml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  type-aliases-package: {{package}}.dto
  configuration:
    map-underscore-to-camel-case: true
    default-fetch-size: 1000
    default-statement-timeout: 300
    cache-enabled: false  # Disable for batch
    lazy-loading-enabled: false
    aggressive-lazy-loading: false

spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      data-source-properties:
        reWriteBatchedInserts: true
```

### MyBatis Config Class

```java
@Configuration
@MapperScan("{{package}}.mapper")
public class MyBatisConfig {

    @Bean
    public SqlSessionFactory sqlSessionFactory(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factory = new SqlSessionFactoryBean();
        factory.setDataSource(dataSource);

        org.apache.ibatis.session.Configuration config =
            new org.apache.ibatis.session.Configuration();
        config.setMapUnderscoreToCamelCase(true);
        config.setDefaultFetchSize(1000);
        config.setCacheEnabled(false);  // No caching for batch

        factory.setConfiguration(config);
        return factory.getObject();
    }

    @Bean
    public SqlSessionTemplate sqlSessionTemplate(SqlSessionFactory sqlSessionFactory) {
        return new SqlSessionTemplate(sqlSessionFactory, ExecutorType.BATCH);
    }
}
```

---

## Performance Optimization

### Batch Executor

```java
@Bean
public SqlSessionTemplate batchSqlSession(SqlSessionFactory sqlSessionFactory) {
    // BATCH executor for bulk operations
    return new SqlSessionTemplate(sqlSessionFactory, ExecutorType.BATCH);
}
```

### Custom Batch Writer with Flush

```java
@Component
public class OptimizedMyBatisWriter implements ItemWriter<TargetRecord> {

    private final SqlSessionTemplate batchSqlSession;

    @Override
    public void write(Chunk<? extends TargetRecord> chunk) throws Exception {
        TargetMapper mapper = batchSqlSession.getMapper(TargetMapper.class);

        for (TargetRecord record : chunk) {
            mapper.insert(record);
        }

        // Flush batch statements
        batchSqlSession.flushStatements();
    }
}
```

---

## Type Handlers

### Custom Type Handler

```java
@MappedTypes(Status.class)
public class StatusTypeHandler extends BaseTypeHandler<Status> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i,
            Status parameter, JdbcType jdbcType) throws SQLException {
        ps.setString(i, parameter.getCode());
    }

    @Override
    public Status getNullableResult(ResultSet rs, String columnName)
            throws SQLException {
        return Status.fromCode(rs.getString(columnName));
    }

    // ... other methods
}
```

### Register Type Handler

```yaml
mybatis:
  type-handlers-package: {{package}}.typehandler
```

---

## Common Pitfalls

### 1. N+1 Queries
**Problem**: Nested selects causing multiple queries.
**Solution**: Use `<collection>` with `fetchType="eager"` or single query with joins.

```xml
<resultMap id="orderWithItems" type="Order">
    <id property="id" column="order_id"/>
    <collection property="items" ofType="OrderItem" fetchType="eager">
        <id property="id" column="item_id"/>
        <result property="productName" column="product_name"/>
    </collection>
</resultMap>

<select id="findOrdersWithItems" resultMap="orderWithItems">
    SELECT o.id as order_id, i.id as item_id, i.product_name
    FROM orders o
    LEFT JOIN order_items i ON o.id = i.order_id
    WHERE o.status = 'PENDING'
</select>
```

### 2. Missing Fetch Size
**Problem**: Default fetch size causes memory issues or slow queries.
**Solution**: Set `fetchSize` in query or configuration.

### 3. Wrong Executor Type
**Problem**: Using SIMPLE executor for batch operations.
**Solution**: Use BATCH executor for write operations.

### 4. Not Using Cursor for Large Reads
**Problem**: Loading all results into memory.
**Solution**: Use `MyBatisCursorItemReader` with proper `fetchSize`.

---

## Testing

```java
@MybatisTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
class SourceMapperTest {

    @Autowired
    private SourceMapper mapper;

    @Test
    @Sql("/test-data.sql")
    void shouldFindPendingRecords() {
        Cursor<SourceRecord> cursor = mapper.findPendingRecords(LocalDate.now());

        List<SourceRecord> records = new ArrayList<>();
        cursor.forEach(records::add);

        assertThat(records).hasSize(10);
    }
}
```
