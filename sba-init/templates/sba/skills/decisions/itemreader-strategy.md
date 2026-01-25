# Decision: ItemReader Strategy

**When to use this skill**: During Phase 2: Architecture when deciding how to read from your data source.

**Token budget**: ~2k tokens

---

## Questioning Protocol

Ask the user these questions BEFORE recommending a reader strategy:

### Block 1: Restartability & Checkpointing

```
Q1: "If the job fails at record #47 million (halfway through),
     should we restart from:
     a) Beginning (complete re-read from start)?
     b) That record (resume from failure point)?
     c) That chunk (resume from last committed 1000-item chunk)?"

Q2: "How do we track 'what's been processed'?
     - ExecutionContext (Spring Batch default)?
     - Custom database table?
     - File marker?"

Q3: "What's your 'resume key'? (what uniquely identifies a record position)
     - customer_id (sequential ID)?
     - timestamp (for time-based ranges)?
     - Sequence number?
     - Other?"
```

**Why ask**: Determines if you need basic reader (JdbcCursorItemReader) or advanced reader (JdbcPagingItemReader) or custom ItemStreamReader.

### Block 2: Data Volume & Query Performance

```
Q4: "Approximately how many rows will the query return?
     - 100K? 1M? 10M? 100M? Billions?"

Q5: "What's the expected chunk size per batch?
     - 1000 items?
     - 5000 items?
     - 10000 items?
     - Other?"

Q6: "What's your filtering strategy?
     - Filter in SQL (WHERE clause)?
     - Filter in Java processor (ItemProcessor)?
     - Both?"
```

**Why ask**: Determines memory requirements, fetch size configuration, and chunk size tuning.

### Block 3: Database Behavior

```
Q7: "How long does the JOIN query take to complete?
     - Seconds? Minutes? Hours?"

Q8: "Are there indexes on the JOIN columns?
     - customer_id indexed?
     - Foreign key columns indexed?
     Can you provide the EXPLAIN PLAN output?"

Q9: "Expected database locks/contention during read?
     - Expect row-level locks?
     - Table-level locks?
     - No locking expected?"
```

**Why ask**: Determines if cursor streaming will work, or if pagination is safer. Informs connection pool sizing.

### Block 4: Exception Handling & Transient Failures

```
Q10: "Have you experienced these database errors in production?
      - DeadlockDetectedException?
      - CannotGetJdbcConnectionException?
      - DataAccessResourceFailureException?
      - Connection timeout?
      - Query timeout?"

Q11: "When a transient database error occurs:
      a) Fail immediately?
      b) Retry automatically (how many times)?
      c) Log and skip the affected records?"
```

**Why ask**: Determines retry/skip configuration and exception handling strategy.

---

## Option Analysis

Based on their answers, present these options:

### Option A: JdbcCursorItemReader (Default for large datasets)

**When to use**:
- Large result sets (10M+ records)
- Sequential ID available for chunking
- Restart from chunk is acceptable
- Performance is critical

**How it works**:
- Opens single database cursor
- Streams results row-by-row
- Commits every N rows (chunk size)
- On failure: restarts from beginning of last committed chunk

**Configuration**:
```java
new JdbcCursorItemReaderBuilder<CustomerInput>()
    .name("customerReader")
    .dataSource(dataSource)
    .sql("SELECT ... WHERE customer_id BETWEEN ? AND ?")  // Partition range
    .rowMapper(new CustomerInputRowMapper())
    .fetchSize(10000)  // PostgreSQL optimization
    .build();
```

**Restart limitations**:
- Cannot resume from exact record; starts from chunk beginning
- Works well for large chunks (1000+ items)
- Not suitable for item-level resume requirement

**Best for**: Your scenario (100M records, partitioning, ≥1000 chunk size)

---

### Option B: JdbcPagingItemReader (Better restartability)

**When to use**:
- Restartability from exact record position is required
- Page-based processing acceptable (1000 items per page)
- Query performance is acceptable with OFFSET/LIMIT

**How it works**:
- Reads pages (e.g., rows 1-1000, then 1001-2000, etc.)
- Tracks current page number in ExecutionContext
- On failure: restarts from failed page

**Configuration**:
```java
new JdbcPagingItemReaderBuilder<CustomerInput>()
    .name("customerReader")
    .dataSource(dataSource)
    .selectClause("SELECT c.*, a.*, o.*")
    .fromClause("FROM customers c LEFT JOIN ...")
    .whereClause("WHERE customer_id BETWEEN ? AND ?")
    .pageSize(1000)
    .sortKey("customer_id")
    .build();
```

**Restart capability**:
- Tracks page number in ExecutionContext
- Resume is at page boundary (1000 item resolution)
- Safer than cursor-based for exact restart

**Trade-off**: OFFSET-based pagination slower on large datasets (later pages slower).

---

### Option C: Custom ItemStreamReader (Maximum control)

**When to use**:
- Complex restart logic required
- Need to resume from exact record position
- Custom checkpointing strategy

**How it works**:
- Implement ItemStreamReader interface
- Define open(), read(), update(), close()
- Track resumption point in ExecutionContext
- Adjust SQL WHERE clause based on last position

**Configuration**:
```java
public class CustomRestartableReader implements ItemStreamReader<CustomerInput> {

    private Long lastProcessedId;

    @Override
    public void open(ExecutionContext context) {
        // Load last position from context
        lastProcessedId = (Long) context.get("lastProcessedId", 0L);
    }

    @Override
    public CustomerInput read() throws Exception {
        // Query with WHERE customer_id > lastProcessedId
        return executeQuery();
    }

    @Override
    public void update(ExecutionContext context) {
        // Save current position
        context.put("lastProcessedId", currentId);
    }
}
```

**Restart capability**:
- Can resume from exact record position (1-item resolution)
- Full control over checkpointing logic

**Trade-off**: More complex code, harder to test, harder to maintain.

---

## Recommendation Decision Tree

```
Does user need to resume from exact record position?
├─ YES: "Restartability from exact record is critical"
│  └─ Consider Option C (Custom ItemStreamReader)
│     OR Option B (JdbcPagingItemReader) if page-level acceptable
│
└─ NO: "Restarting from chunk boundary is acceptable"
   └─ Use Option A (JdbcCursorItemReader) - simpler, faster
      ← **RECOMMENDED for 100M records in tight window**
```

---

## PostgreSQL-Specific Tuning

If using JdbcCursorItemReader with PostgreSQL:

```java
.fetchSize(10000)        // Tune for PostgreSQL driver
.useSharedExtendedConnection(false)  // Avoid connection sharing issues
// Configure connection pool size large enough for partitioned reads
```

---

## Questions to Ask User

After presenting options, confirm:

- [ ] Which restart strategy do you prefer? (chunk, page, or exact record)
- [ ] Do you have an EXPLAIN PLAN for your query?
- [ ] What's your expected chunk size?
- [ ] Are there any transient database errors you've experienced?

**Document the decision in ADR-001: ItemReader Strategy**

---

