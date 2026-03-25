# Oracle Database Skill

**Purpose**: Oracle-specific optimizations and patterns for Spring Batch.

---

## Connection Configuration

### application.yml

```yaml
spring:
  datasource:
    url: jdbc:oracle:thin:@//${DB_HOST:localhost}:${DB_PORT:1521}/${DB_SERVICE:ORCL}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
    driver-class-name: oracle.jdbc.OracleDriver

    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      connection-timeout: 20000
      idle-timeout: 300000
      max-lifetime: 1200000
      pool-name: BatchHikariPool

      data-source-properties:
        oracle.jdbc.implicitStatementCacheSize: 50
        oracle.jdbc.defaultRowPrefetch: 1000
        oracle.jdbc.useFetchSizeWithLongColumn: true
```

### JDBC URL Variants

```
# Basic connection
jdbc:oracle:thin:@//host:1521/service

# With SID (legacy)
jdbc:oracle:thin:@host:1521:SID

# TNS connection
jdbc:oracle:thin:@(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=host)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=service)))

# With failover
jdbc:oracle:thin:@(DESCRIPTION=
  (ADDRESS_LIST=
    (ADDRESS=(PROTOCOL=TCP)(HOST=primary)(PORT=1521))
    (ADDRESS=(PROTOCOL=TCP)(HOST=secondary)(PORT=1521))
  )
  (CONNECT_DATA=(SERVICE_NAME=service))
  (FAILOVER=ON)
)
```

---

## Batch Job Repository Schema

### Initialize Schema

```yaml
spring:
  batch:
    jdbc:
      initialize-schema: always
      # Oracle-specific schema
      schema: classpath:org/springframework/batch/core/schema-oracle.sql
```

### Custom Sequence Configuration

```java
@Configuration
public class BatchConfig {

    @Bean
    public JobRepository jobRepository(DataSource dataSource,
            PlatformTransactionManager transactionManager) throws Exception {

        JobRepositoryFactoryBean factory = new JobRepositoryFactoryBean();
        factory.setDataSource(dataSource);
        factory.setTransactionManager(transactionManager);
        factory.setDatabaseType("ORACLE");
        factory.setIncrementerFactory(new OracleSequenceMaxValueIncrementerFactory(dataSource));
        factory.afterPropertiesSet();
        return factory.getObject();
    }
}
```

---

## Reader Optimizations

### JDBC Cursor Reader with Row Prefetch

```java
@Bean
@StepScope
public JdbcCursorItemReader<DataRecord> cursorReader(DataSource dataSource) {
    return new JdbcCursorItemReaderBuilder<DataRecord>()
        .name("oracleCursorReader")
        .dataSource(dataSource)
        .sql("""
            SELECT /*+ PARALLEL(4) FIRST_ROWS(1000) */
                   id, field1, field2, created_at
            FROM source_table
            WHERE status = 'PENDING'
            ORDER BY id
            """)
        .rowMapper(new DataRecordRowMapper())
        .fetchSize(1000)  // Oracle row prefetch
        .build();
}
```

### JDBC Paging Reader (Oracle Syntax)

```java
@Bean
@StepScope
public JdbcPagingItemReader<DataRecord> pagingReader(
        DataSource dataSource,
        @Value("#{jobParameters['status']}") String status) {

    OraclePagingQueryProvider queryProvider = new OraclePagingQueryProvider();
    queryProvider.setSelectClause("SELECT id, field1, field2");
    queryProvider.setFromClause("FROM source_table");
    queryProvider.setWhereClause("WHERE status = :status");
    queryProvider.setSortKeys(Map.of("id", Order.ASCENDING));

    return new JdbcPagingItemReaderBuilder<DataRecord>()
        .name("oraclePagingReader")
        .dataSource(dataSource)
        .queryProvider(queryProvider)
        .parameterValues(Map.of("status", status))
        .pageSize(1000)
        .rowMapper(new DataRecordRowMapper())
        .build();
}
```

### Stored Procedure Reader

```java
@Bean
@StepScope
public StoredProcedureItemReader<DataRecord> storedProcReader(DataSource dataSource) {
    StoredProcedureItemReader<DataRecord> reader = new StoredProcedureItemReader<>();
    reader.setDataSource(dataSource);
    reader.setProcedureName("PKG_BATCH.GET_PENDING_RECORDS");
    reader.setRefCursorPosition(1);
    reader.setRowMapper(new DataRecordRowMapper());

    SqlParameter[] params = {
        new SqlOutParameter("p_cursor", OracleTypes.CURSOR),
        new SqlParameter("p_status", Types.VARCHAR)
    };
    reader.setParameters(params);
    reader.setPreparedStatementSetter(ps -> ps.setString(1, "PENDING"));

    return reader;
}
```

---

## Writer Optimizations

### JDBC Batch Writer with Array Binding

```java
@Bean
public JdbcBatchItemWriter<DataRecord> batchWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<DataRecord>()
        .dataSource(dataSource)
        .sql("""
            INSERT INTO target_table (id, field1, field2, created_at)
            VALUES (:id, :field1, :field2, :createdAt)
            """)
        .beanMapped()
        .build();
}
```

### Oracle MERGE (Upsert)

```java
@Bean
public JdbcBatchItemWriter<DataRecord> mergeWriter(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<DataRecord>()
        .dataSource(dataSource)
        .sql("""
            MERGE INTO target_table t
            USING (SELECT :id AS id FROM DUAL) s
            ON (t.id = s.id)
            WHEN MATCHED THEN
                UPDATE SET
                    field1 = :field1,
                    field2 = :field2,
                    updated_at = SYSDATE
            WHEN NOT MATCHED THEN
                INSERT (id, field1, field2, created_at)
                VALUES (:id, :field1, :field2, SYSDATE)
            """)
        .beanMapped()
        .build();
}
```

### Bulk Insert with INSERT ALL

```java
@Component
public class OracleBulkWriter implements ItemWriter<DataRecord> {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void write(Chunk<? extends DataRecord> chunk) throws Exception {
        if (chunk.isEmpty()) return;

        StringBuilder sql = new StringBuilder("INSERT ALL ");
        List<Object> params = new ArrayList<>();

        for (DataRecord record : chunk) {
            sql.append("""
                INTO target_table (id, field1, field2, created_at)
                VALUES (?, ?, ?, SYSDATE)
                """);
            params.add(record.getId());
            params.add(record.getField1());
            params.add(record.getField2());
        }
        sql.append("SELECT 1 FROM DUAL");

        jdbcTemplate.update(sql.toString(), params.toArray());
    }
}
```

---

## Oracle-Specific SQL Patterns

### Pagination (OFFSET FETCH - Oracle 12c+)

```sql
SELECT id, field1, field2
FROM source_table
WHERE status = 'PENDING'
ORDER BY id
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```

### Pagination (ROWNUM - Legacy)

```sql
SELECT * FROM (
    SELECT a.*, ROWNUM rnum FROM (
        SELECT id, field1, field2
        FROM source_table
        WHERE status = 'PENDING'
        ORDER BY id
    ) a
    WHERE ROWNUM <= :endRow
)
WHERE rnum > :startRow
```

### Bulk Collect with FORALL

```sql
DECLARE
    TYPE id_array IS TABLE OF NUMBER;
    TYPE field_array IS TABLE OF VARCHAR2(100);
    v_ids id_array;
    v_field1 field_array;
BEGIN
    SELECT id, field1
    BULK COLLECT INTO v_ids, v_field1
    FROM source_table
    WHERE status = 'PENDING';

    FORALL i IN 1..v_ids.COUNT
        INSERT INTO target_table (id, field1) VALUES (v_ids(i), v_field1(i));

    COMMIT;
END;
```

### Parallel DML

```sql
-- Enable parallel DML for session
ALTER SESSION ENABLE PARALLEL DML;

-- Parallel insert
INSERT /*+ PARALLEL(target_table, 4) APPEND */
INTO target_table
SELECT /*+ PARALLEL(source_table, 4) */
    id, field1, field2
FROM source_table
WHERE status = 'PENDING';
```

### Direct Path Insert

```sql
INSERT /*+ APPEND */ INTO target_table (id, field1, field2)
SELECT id, field1, field2 FROM source_table WHERE status = 'PENDING';
```

---

## Sequence Handling

### Sequence for ID Generation

```sql
CREATE SEQUENCE batch_data_seq
    START WITH 1
    INCREMENT BY 50  -- Match batch size
    CACHE 100
    NOCYCLE;
```

### Using Sequence in Writer

```java
@Bean
public JdbcBatchItemWriter<DataRecord> writerWithSequence(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<DataRecord>()
        .dataSource(dataSource)
        .sql("""
            INSERT INTO target_table (id, field1, field2)
            VALUES (batch_data_seq.NEXTVAL, :field1, :field2)
            """)
        .beanMapped()
        .build();
}
```

---

## Hints and Optimization

### Common Oracle Hints

```sql
-- Force index use
SELECT /*+ INDEX(t idx_status) */ * FROM source_table t

-- Parallel query
SELECT /*+ PARALLEL(4) */ * FROM source_table

-- First rows optimization (batch-friendly)
SELECT /*+ FIRST_ROWS(1000) */ * FROM source_table

-- Full table scan (when reading most data)
SELECT /*+ FULL(t) */ * FROM source_table t

-- Disable result cache
SELECT /*+ NO_RESULT_CACHE */ * FROM source_table
```

### Session Settings for Batch

```sql
-- Increase PGA for sorting/hashing
ALTER SESSION SET workarea_size_policy = MANUAL;
ALTER SESSION SET sort_area_size = 104857600;  -- 100MB
ALTER SESSION SET hash_area_size = 104857600;  -- 100MB

-- Disable logging (careful!)
ALTER TABLE target_table NOLOGGING;
```

---

## Partitioning Strategies

### Range Partitioner for Oracle

```java
@Component
public class OracleRangePartitioner implements Partitioner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        // Get ID ranges
        String sql = """
            SELECT MIN(id), MAX(id) FROM source_table WHERE status = 'PENDING'
            """;

        jdbcTemplate.query(sql, rs -> {
            long min = rs.getLong(1);
            long max = rs.getLong(2);
            long range = (max - min) / gridSize + 1;

            for (int i = 0; i < gridSize; i++) {
                ExecutionContext ctx = new ExecutionContext();
                ctx.putLong("minId", min + (i * range));
                ctx.putLong("maxId", min + ((i + 1) * range) - 1);
                partitions.put("partition" + i, ctx);
            }
        });

        return partitions;
    }
}
```

### Partition-Aware Reader

```java
@Bean
@StepScope
public JdbcPagingItemReader<DataRecord> partitionedReader(
        DataSource dataSource,
        @Value("#{stepExecutionContext['minId']}") Long minId,
        @Value("#{stepExecutionContext['maxId']}") Long maxId) {

    OraclePagingQueryProvider provider = new OraclePagingQueryProvider();
    provider.setSelectClause("SELECT id, field1, field2");
    provider.setFromClause("FROM source_table");
    provider.setWhereClause("WHERE id BETWEEN :minId AND :maxId AND status = 'PENDING'");
    provider.setSortKeys(Map.of("id", Order.ASCENDING));

    return new JdbcPagingItemReaderBuilder<DataRecord>()
        .name("partitionedReader")
        .dataSource(dataSource)
        .queryProvider(provider)
        .parameterValues(Map.of("minId", minId, "maxId", maxId))
        .pageSize(1000)
        .rowMapper(new DataRecordRowMapper())
        .build();
}
```

---

## Monitoring Queries

### Active Sessions

```sql
SELECT sid, serial#, username, program, status, sql_id,
       event, seconds_in_wait
FROM v$session
WHERE username = 'BATCH_USER'
  AND status = 'ACTIVE';
```

### Long Operations

```sql
SELECT sid, opname, target, sofar, totalwork,
       ROUND(sofar/totalwork*100, 2) AS pct_done,
       elapsed_seconds, time_remaining
FROM v$session_longops
WHERE time_remaining > 0
  AND opname NOT LIKE '%aggregate%';
```

### Lock Contention

```sql
SELECT
    blocking.sid AS blocker_sid,
    blocked.sid AS blocked_sid,
    blocked.serial# AS blocked_serial,
    blocked_sql.sql_text AS blocked_sql
FROM v$lock blocked_lock
JOIN v$session blocked ON blocked.sid = blocked_lock.sid
JOIN v$lock blocking_lock ON blocking_lock.id1 = blocked_lock.id1
    AND blocking_lock.id2 = blocked_lock.id2
    AND blocking_lock.block = 1
JOIN v$session blocking ON blocking.sid = blocking_lock.sid
LEFT JOIN v$sql blocked_sql ON blocked.sql_id = blocked_sql.sql_id
WHERE blocked_lock.request > 0;
```

---

## Common Pitfalls

### 1. Missing Row Prefetch
**Impact**: Slow network performance
**Solution**: Set `oracle.jdbc.defaultRowPrefetch` in connection properties

### 2. Not Using APPEND Hint
**Impact**: Slow bulk inserts
**Solution**: Use `INSERT /*+ APPEND */` for direct path insert

### 3. Ignoring Parallel Hints
**Impact**: Not utilizing server capacity
**Solution**: Add `/*+ PARALLEL(n) */` hints for large operations

### 4. Small Commit Intervals
**Impact**: Excessive redo log generation
**Solution**: Increase chunk size, commit less frequently

### 5. Not Disabling Triggers
**Impact**: Trigger overhead on bulk operations
**Solution**: Disable triggers during batch, re-enable after

```sql
ALTER TRIGGER trigger_name DISABLE;
-- Run batch
ALTER TRIGGER trigger_name ENABLE;
```

---

## Testing with Testcontainers

```java
@Testcontainers
@SpringBootTest
class OracleBatchTest {

    @Container
    static OracleContainer oracle = new OracleContainer("gvenzl/oracle-xe:21-slim")
        .withDatabaseName("testdb")
        .withUsername("testuser")
        .withPassword("testpass")
        .withInitScript("schema-oracle.sql");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", oracle::getJdbcUrl);
        registry.add("spring.datasource.username", oracle::getUsername);
        registry.add("spring.datasource.password", oracle::getPassword);
    }
}
```
