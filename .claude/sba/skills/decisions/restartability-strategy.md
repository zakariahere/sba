# Decision: Restartability & Checkpointing Strategy

**When to use this skill**: During Phase 2: Architecture when understanding how to resume jobs from failure points.

**Token budget**: ~2.5k tokens

---

## Concept Overview

**The Problem**: Job processes 100M records. Fails at record 47 million. Should we:
- Restart from beginning (reprocess 47M records = waste)?
- Resume from record 47M (what state are we in)?
- Resume from last committed chunk?

**The Solution**: Spring Batch's `ExecutionContext` + `ItemStreamReader`

---

## Spring Batch Restart Fundamentals

### What is ExecutionContext?

```yaml
ExecutionContext:
  What: Key-value store per StepExecution
  Scope: Persisted in JobRepository (database)
  Purpose: Track state across job runs

  Example:
    {
      "lastProcessedId": 47000000,
      "rowsWritten": 47000000,
      "currentChunkStart": 46999000,
      "resumePoint": "customer_id=47000001"
    }

  On restart:
    JobLauncher loads previous ExecutionContext
    Reader resumes from lastProcessedId
    Writer knows rowsWritten already
```

### What is ItemStreamReader?

```yaml
ItemStreamReader Interface:

  open(ExecutionContext context)
    Called once when step starts
    Load resumption point from context
    Adjust query to start from there

  read() : T
    Read next record
    Return null when done

  update(ExecutionContext context)
    Called after successful chunk commit
    Save current position to context
    Allows resume on next restart

  close()
    Called when step completes
    Clean up resources
```

---

## Restart Scenarios

### Scenario 1: Restart from Chunk Boundary (Default)

**How it works**:
```
Run 1: Read records 1-47M, commit chunks of 1000
       Fails at record 47.5M during PROCESS step
       Last committed chunk: records 47M-47,000,999

Run 2: JobLauncher.run(job, jobParameters) with same parameters
       Spring Batch detects previous StepExecution
       Loads ExecutionContext with lastCommittedChunk = 47M
       Reader starts from 47,001,000
```

**ExecutionContext content**:
```java
{
  "spring.batch.item.database.jdbc.JdbcCursorItemReader.readCount": 47001000,
  "_long": 47001000
}
```

**Code**:
```java
// Reader does NOT implement ItemStreamReader
// Spring Batch automatically handles chunk tracking
// Simple JdbcCursorItemReader

new JdbcCursorItemReaderBuilder<CustomerInput>()
    .name("customerReader")
    .dataSource(dataSource)
    .sql("SELECT * FROM customers WHERE id BETWEEN ? AND ?")
    .rowMapper(mapper)
    .build();
    // On restart: automatically starts from 47,001,000
```

**Restart granularity**: Chunk size (e.g., 1000 records)
**Implementation complexity**: Low (Spring does it automatically)
**Resume point accuracy**: ±1000 records

**Best for**: Large batches where chunk-level resume is acceptable

---

### Scenario 2: Restart from Exact Record (Custom ItemStreamReader)

**How it works**:
```
Run 1: Process record 47.5M
       Fails in PROCESS or WRITE
       Save to ExecutionContext: "lastProcessedId": 47500000

Run 2: Load ExecutionContext
       Custom reader sees "lastProcessedId" = 47500000
       Adjusts SQL: WHERE customer_id > 47500000
       Reads from record 47500001
```

**ExecutionContext content**:
```java
{
  "lastProcessedId": 47500000,
  "recordsProcessed": 47500000,
  "lastProcessedTimestamp": "2026-01-25T14:30:00",
  "resumeKey": "47500001"
}
```

**Code**:
```java
@Slf4j
public class RestartableCustomerReader implements ItemStreamReader<CustomerInput> {

    private Long lastProcessedId = 0L;
    private JdbcTemplate jdbcTemplate;
    private boolean initialized = false;

    @Override
    public void open(ExecutionContext context) {
        // Load last processed ID from context
        Long saved = (Long) context.get("lastProcessedId", 0L);
        this.lastProcessedId = saved;
        log.info("Opened reader, resuming from customer_id > {}", lastProcessedId);
        initialized = true;
    }

    @Override
    public CustomerInput read() throws Exception {
        if (!initialized) return null;

        // Query parameterized with resumption point
        String sql = """
            SELECT * FROM customers
            WHERE customer_id > ?
            ORDER BY customer_id
            LIMIT 1
            """;

        CustomerInput customer = jdbcTemplate.queryForObject(sql, mapper, lastProcessedId);
        this.lastProcessedId = customer.getId();
        return customer;
    }

    @Override
    public void update(ExecutionContext context) {
        // Save current position after each chunk commit
        context.put("lastProcessedId", lastProcessedId);
        context.put("recordsProcessed", lastProcessedId);
        log.debug("Saved resumption point: {}", lastProcessedId);
    }

    @Override
    public void close() {
        log.info("Reader closed");
    }
}
```

**Restart granularity**: Record-level (1 record resolution)
**Implementation complexity**: Medium (custom logic)
**Resume point accuracy**: Exact (±0 records)

**Best for**: When you need exact record-level resume and have a unique ID column

---

### Scenario 3: Restart from Last Step Only (Simple approach)

**How it works**:
```
Run 1: Process records 1-47.5M
       Fails
       Mark entire batch as failed

Run 2: Delete all output from Run 1
       Re-run entire job from beginning
       Process records 1-100M again
```

**ExecutionContext**: Not used

**Code**:
```java
// Just use standard JdbcCursorItemReader
// On restart: delete customer_etl_output.csv
// Run job again from scratch
```

**Restart granularity**: Full restart
**Implementation complexity**: Minimal
**Resume point accuracy**: None (complete re-process)

**Best for**: When dataset is small (<10M) or re-processing cost acceptable

---

## Skip Tracking & ExecutionContext

### Tracking Skip Count

```java
@Component
@Slf4j
public class SkipTrackingListener implements SkipListener<CustomerInput, CustomerOutput> {

    @Override
    public void onSkipInProcess(CustomerInput item, Throwable t) {
        StepExecution stepExecution =
            StepSynchronizationManager.getContext().getStepExecution();

        ExecutionContext context = stepExecution.getExecutionContext();

        // Track skip count
        long skipCount = (Long) context.getOrDefault("skipCount", 0L);
        context.put("skipCount", skipCount + 1);

        // Track skip reasons
        String errorType = t.getClass().getSimpleName();
        long errorCount = (Long) context.getOrDefault("error_" + errorType, 0L);
        context.put("error_" + errorType, errorCount + 1);

        log.warn("Skipped item {}: {} (total skips: {})",
            item.getId(), errorType, skipCount + 1);
    }
}
```

### On Restart: Skip Counts Preserved

```yaml
Run 1:
  Processed: 47.5M records
  Skipped: 10K records (0.02%)
  ExecutionContext: { skipCount: 10000, error_ValidationException: 8000 }

Run 2: (Job restarts at record 47.5M)
  Skip count starts at 10000 (loaded from context)
  If 5K more records skipped in resumed section
  Final skip count: 15000
```

---

## Deciding on Restart Strategy

### Decision Matrix

| Requirement | Scenario 1 (Chunk) | Scenario 2 (Exact) | Scenario 3 (Full) |
|-------------|-------- ------| ---------------| -------------|
| **Restart precision** | ±1000 records | ±0 records | Reprocess all |
| **Code complexity** | Low | Medium | Minimal |
| **Resume speed** | Very fast | Fast | Slowest |
| **Storage overhead** | None | Small (save ID) | None |
| **Best for** | Large jobs, chunks OK | Exact resume needed | Small datasets |
| **Your use case** | ✅ RECOMMENDED | ❌ (chunk OK) | ❌ (too slow) |

---

## Questions to Ask User

```
Q1: "If the job fails at record 47M:
     a) Restart from chunk boundary (last committed 1000-item chunk)?
     b) Restart from exact record?
     c) Restart from beginning (full re-process)?"

Q2: "Is your dataset suitable for exact-record resume?
     a) Yes, we have a unique sequential ID (customer_id)?
     b) No, records don't have good resume key?"

Q3: "How often do you expect restarts?
     a) Rarely (maybe once per month)?
     b) Sometimes (few times per year)?
     c) Frequently (multiple times per execution)?"

Q4: "What's the cost of reprocessing 1M records?
     a) Quick (5 minutes)?
     b) Expensive (1 hour)?
     c) Very expensive (multiple hours)?"

Q5: "Should skip count be preserved across restarts?
     a) Yes, total skip count should accumulate?
     b) No, reset on each restart?"
```

---

## Recommendation

**For your 100M record ETL batch job**:

✅ **Use Scenario 1: Chunk Boundary Restart**

**Why**:
- Simple (automatic, no custom code)
- Fast resume (start at chunk boundary)
- Good enough (±1000 records acceptable for 100M)
- ExecutionContext automatically managed by Spring Batch
- Scales well for partitioned jobs

**Configuration**:
```java
// Just use standard readers/writers
// Spring Batch handles restart automatically in JobRepository

new JdbcCursorItemReaderBuilder<>()
    .name("customerReader")
    .dataSource(dataSource)
    .sql("SELECT * FROM customers WHERE id BETWEEN ? AND ?")
    .build()
    // Automatic: On restart, reads from last committed chunk
```

**When to use Scenario 2** (Exact record resume):
- If reprocessing cost is very high
- And you have exact resume key (unique ID)
- And you want zero record loss
- And you're willing to write custom ItemStreamReader

---

## Implementation Checklist

- [ ] Decide on restart granularity (chunk vs exact)
- [ ] Configure JobRepository database (BATCH_STEP_EXECUTION table)
- [ ] If custom ItemStreamReader: implement open() with context loading
- [ ] If custom ItemStreamReader: implement update() with context saving
- [ ] Add skip listener to track skip count
- [ ] On job restart: understand what ExecutionContext contains
- [ ] Test restart scenario: fail mid-job, then re-run

---

