# PostgreSQL Database Skill

**Purpose**: PostgreSQL-specific optimizations and patterns for Spring Batch.

---

## Connection Configuration

### application.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:batch_db}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
    driver-class-name: org.postgresql.Driver

    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
      idle-timeout: 300000
      connection-timeout: 20000
      max-lifetime: 1200000
      pool-name: BatchHikariPool

      # PostgreSQL specific
      data-source-properties:
        reWriteBatchedInserts: true  # Critical for batch performance
        prepareThreshold: 5
        preparedStatementCacheQueries: 256
        preparedStatementCacheSizeMiB: 5
```

### JDBC URL Parameters

```
jdbc:postgresql://host:5432/db?
  reWriteBatchedInserts=true&      # Rewrite INSERTs to multi-row
  prepareThreshold=5&              # Use prepared statements after N uses
  defaultRowFetchSize=1000&        # Cursor fetch size
  socketTimeout=300&               # 5 min socket timeout
  connectTimeout=10                # 10 sec connect timeout
```

---

## Batch Job Repository Schema

### Initialize Schema

```yaml
spring:
  batch:
    jdbc:
      initialize-schema: always  # Creates Spring Batch tables
      # Or use: never (for production with pre-created tables)
```

### Custom Schema Location

```yaml
spring:
  batch:
    jdbc:
      schema: classpath:org/springframework/batch/core/schema-postgresql.sql
```

---

## Reader Optimizations

### JDBC Cursor Reader (Best for large datasets)

```java
@Bean
@StepScope
public JdbcCursorItemReader<DataRecord> cursorReader(DataSource dataSource) {
    return new JdbcCursorItemReaderBuilder<DataRecord>()
        .name("postgresReader")
        .dataSource(dataSource)
        .sql("""
            SELECT id, field1, field2, created_at
            FROM source_table
            WHERE status = 'PENDING'
            ORDER BY id
            """)
        .rowMapper(new DataRecordRowMapper())
        .fetchSize(1000)           // PostgreSQL cursor fetch size
        .verifyCursorPosition(false)  // Better performance
        .build();
}
```

### JDBC Paging Reader (For restartability)

```java
@Bean
@StepScope
public JdbcPagingItemReader<DataRecord> pagingReader(
        DataSource dataSource,
        @Value("#{jobParameters['date']}") String date) {

    Map<String, Object> params = new HashMap<>();
    params.put("processDate", LocalDate.parse(date));

    return new JdbcPagingItemReaderBuilder<DataRecord>()
        .name("postgresPagingReader")
        .dataSource(dataSource)
        .selectClause("SELECT id, field1, field2")
        .fromClause("FROM source_table")
        .whereClause("WHERE process_date = :processDate AND status = 'PENDING'")
        .sortKeys(Map.of("id", Order.ASCENDING))
        .parameterValues(params)
        .pageSize(1000)
        .rowMapper(new DataRecordRowMapper())
        .build();
}
```

### Using COPY for Bulk Read (Custom Reader)

```java
public class PostgresCopyItemReader implements ItemReader<String[]> {
    private final CopyManager copyManager;
    private BufferedReader reader;

    @Override
    public String[] read() throws Exception {
        String line = reader.readLine();
        if (line == null) return null;
        return line.split("\t");
    }

    public void open(String query) throws SQLException, IOException {
        PipedInputStream in = new PipedInputStream();
        PipedOutputStream out = new PipedOutputStream(in);
        reader = new BufferedReader(new InputStreamReader(in));

        CompletableFuture.runAsync(() -> {
            try {
                copyManager.copyOut("COPY (" + query + ") TO STDOUT", out);
                out.close();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
}
```

---

## Writer Optimizations

### JDBC Batch Writer (Recommended)

```java
@Bean
public JdbcBatchItemWriter<DataRecord> writer(DataSource dataSource) {
    return new JdbcBatchItemWriterBuilder<DataRecord>()
        .dataSource(dataSource)
        .sql("""
            INSERT INTO target_table (id, field1, field2, created_at)
            VALUES (:id, :field1, :field2, :createdAt)
            ON CONFLICT (id) DO UPDATE SET
                field1 = EXCLUDED.field1,
                field2 = EXCLUDED.field2,
                updated_at = NOW()
            """)
        .beanMapped()
        .build();
}
```

### Using COPY for Bulk Load (Custom Writer)

```java
@Component
public class PostgresCopyItemWriter implements ItemWriter<DataRecord> {

    private final DataSource dataSource;

    @Override
    public void write(Chunk<? extends DataRecord> chunk) throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            CopyManager copyManager = conn.unwrap(PGConnection.class).getCopyAPI();

            StringWriter sw = new StringWriter();
            for (DataRecord record : chunk) {
                sw.write(String.join("\t",
                    record.getId().toString(),
                    record.getField1(),
                    record.getField2()
                ));
                sw.write("\n");
            }

            copyManager.copyIn(
                "COPY target_table (id, field1, field2) FROM STDIN",
                new StringReader(sw.toString())
            );
        }
    }
}
```

### Multi-Row INSERT (Alternative to COPY)

```java
@Bean
public JdbcBatchItemWriter<DataRecord> multiRowWriter(DataSource dataSource) {
    // With reWriteBatchedInserts=true, this becomes multi-row INSERT
    return new JdbcBatchItemWriterBuilder<DataRecord>()
        .dataSource(dataSource)
        .sql("INSERT INTO target_table (field1, field2) VALUES (:field1, :field2)")
        .beanMapped()
        .build();
}
```

---

## PostgreSQL-Specific SQL Patterns

### Upsert (INSERT ON CONFLICT)

```sql
INSERT INTO target_table (id, data, updated_at)
VALUES (:id, :data, NOW())
ON CONFLICT (id) DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = NOW()
```

### Bulk Update with CTE

```sql
WITH updates AS (
    SELECT unnest(:ids::bigint[]) AS id,
           unnest(:values::text[]) AS new_value
)
UPDATE target_table t
SET value = u.new_value,
    updated_at = NOW()
FROM updates u
WHERE t.id = u.id
```

### Partitioned Table Query

```sql
-- Query specific partition
SELECT * FROM source_table
WHERE created_at >= '2024-01-01' AND created_at < '2024-02-01'
ORDER BY id

-- PostgreSQL will automatically route to correct partition
```

### Window Functions for Delta Processing

```sql
SELECT *
FROM (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY version DESC) as rn
    FROM change_log
    WHERE created_at > :lastProcessed
) ranked
WHERE rn = 1
```

---

## Index Recommendations

### For Batch Processing

```sql
-- Status-based processing
CREATE INDEX CONCURRENTLY idx_status_id
ON source_table (status, id)
WHERE status = 'PENDING';

-- Date-based partitioning
CREATE INDEX CONCURRENTLY idx_process_date
ON source_table (process_date, id);

-- Covering index (avoid table lookup)
CREATE INDEX CONCURRENTLY idx_covering
ON source_table (status, id)
INCLUDE (field1, field2);
```

### Index Maintenance

```sql
-- Reindex after large batch operations
REINDEX INDEX CONCURRENTLY idx_name;

-- Analyze statistics
ANALYZE source_table;
```

---

## Performance Tuning

### Session Settings for Batch

```sql
-- In reader initialization
SET work_mem = '256MB';
SET maintenance_work_mem = '512MB';
SET synchronous_commit = OFF;  -- Caution: risk of data loss on crash
```

### Via DataSource

```java
@Bean
public DataSource batchDataSource() {
    HikariDataSource ds = new HikariDataSource();
    // ... basic config ...
    ds.setConnectionInitSql("""
        SET work_mem = '256MB';
        SET statement_timeout = '300s';
        """);
    return ds;
}
```

---

## Monitoring Queries

### Active Batch Queries

```sql
SELECT pid, query, state, wait_event_type, wait_event,
       NOW() - query_start AS duration
FROM pg_stat_activity
WHERE application_name LIKE '%batch%'
  AND state != 'idle';
```

### Table Bloat Check

```sql
SELECT relname, n_dead_tup, n_live_tup,
       round(n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE relname = 'target_table';
```

### Lock Monitoring

```sql
SELECT blocked.pid AS blocked_pid,
       blocked.query AS blocked_query,
       blocking.pid AS blocking_pid,
       blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid
JOIN pg_locks l ON l.locktype = bl.locktype
  AND l.relation = bl.relation
  AND l.pid != bl.pid
JOIN pg_stat_activity blocking ON blocking.pid = l.pid
WHERE NOT bl.granted;
```

---

## Common Pitfalls

### 1. Missing `reWriteBatchedInserts`
**Impact**: 10-50x slower inserts
**Solution**: Add to JDBC URL or data source properties

### 2. Small `fetchSize`
**Impact**: Excessive round trips
**Solution**: Set `fetchSize` >= chunk size (1000+)

### 3. Not Using Covering Indexes
**Impact**: Expensive table lookups
**Solution**: Use `INCLUDE` for frequently accessed columns

### 4. Forgetting VACUUM
**Impact**: Table bloat, slow queries
**Solution**: Schedule regular VACUUM ANALYZE

### 5. Long Transactions
**Impact**: Bloat, lock contention
**Solution**: Keep chunks small, commit frequently

---

## Testing with Testcontainers

```java
@Testcontainers
@SpringBootTest
class PostgresBatchTest {

    @Container
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("batch_test")
            .withInitScript("schema.sql");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```
