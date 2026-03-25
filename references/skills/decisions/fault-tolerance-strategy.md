# Decision: Fault Tolerance Strategy

**When to use this skill**: During Phase 2: Architecture when designing error handling, skip policy, and retry strategy.

**Token budget**: ~2k tokens

---

## Questioning Protocol

Ask the user these questions BEFORE recommending fault tolerance strategy:

### Block 1: Skip Policy (Invalid Records)

```
Q1: "What makes a record 'invalid' or 'un-processable'?
     - Null in required field?
     - Constraint violation (duplicate key)?
     - Validation rule failure (bad format)?
     - Data type conversion failure?
     - Other?"

Q2: "When an invalid record is encountered:
     a) Fail the entire job immediately?
     b) Skip it and continue with next record?
     c) Log it and decide manually?"

Q3: "Maximum acceptable skip count?
     - 0 (fail on first error)?
     - 100 (1 per 1M records)?
     - 1,000?
     - 10,000?
     - 50,000 (0.05% of 100M)?
     - No limit?"

Q4: "If skip limit exceeded:
     a) Fail the job?
     b) Continue anyway?
     c) Alert but don't fail?"

Q5: "For skipped records:
     - Write to dead letter file?
     - Log error reason?
     - Track which field caused skip?
     - Store in database table?"
```

**Why ask**: Determines skip exceptions, skip limit, and dead letter file content.

### Block 2: Retry Policy (Transient Database Errors)

```
Q6: "Have you experienced these database errors in production?
     (Mark all that apply)
     ☐ Deadlock detected
     ☐ Cannot get JDBC connection
     ☐ Connection timeout
     ☐ Connection refused
     ☐ Query timeout
     ☐ Network timeout
     ☐ Temporary database unavailable
     ☐ Other (specify)?"

Q7: "For transient errors (connection timeout, deadlock):
     a) Fail immediately?
     b) Retry automatically?
     c) Retry with backoff?
     d) Retry with max attempts?"

Q8: "If retry strategy:
     - How many retries? (1? 3? 5?)
     - Backoff type?
       (fixed delay, exponential, random?)
     - Initial delay? (100ms? 500ms? 1s?)
     - Max delay? (5s? 30s?)
     - Give up after? (10 seconds? 60 seconds?)

Q9: "Which exceptions should retry?
     (Transient = might succeed if retried)
     - DeadlockDetectedException?
     - CannotGetJdbcConnectionException?
     - DataAccessResourceFailureException?
     - QueryTimeoutException?
     - Other?"

Q10: "Which exceptions should fail immediately?
      (Fatal = won't succeed no matter how many retries)
      - DataIntegrityViolationException? (constraint violation)
      - ValidationException? (bad data)
      - FatalProcessingException?"
```

**Why ask**: Determines retry exceptions, retry count, backoff strategy.

### Block 3: Exception Categorization

```
Q11: "For your application, categorize exceptions:

SKIP: Record-level errors, continue processing
     - ValidationException?
     - DataIntegrityViolationException?
     - IllegalArgumentException?
     - Other?"

RETRY: Transient DB issues, retry automatically
     - DeadlockLoserDataAccessException?
     - CannotGetJdbcConnectionException?
     - DataAccessResourceFailureException?
     - QueryTimeoutException?
     - Other?"

FAIL: Stop immediately
     - FatalProcessingException?
     - DataAccessException (non-transient)?
     - OutOfMemoryError?
     - Other?"
```

### Block 4: Restart & Resumption

```
Q12: "On job failure, should we:
      a) Restart from beginning?
      b) Resume from failure point?
      c) Restart from last committed chunk?"

Q13: "How do we avoid reprocessing already-written records?
      a) Delete output file on restart?
      b) Track written record count in ExecutionContext?
      c) Use idempotent writer (can overwrite safely)?
      d) Manual intervention?"

Q14: "If we skip 10K records, then later fail at record 100M:
      - Should we re-skip the same 10K records on restart?
      - Or resume processing with skip count at 10K?"
```

**Why ask**: Determines restart behavior and skip tracking strategy.

---

## PostgreSQL Exception Types to Handle

**Common PostgreSQL exceptions** (through Spring JDBC):

| Exception | Cause | Type | Action |
|-----------|-------|------|--------|
| `DeadlockLoserDataAccessException` | Two transactions deadlock; one loses | TRANSIENT | RETRY |
| `CannotGetJdbcConnectionException` | Connection pool exhausted or DB down | TRANSIENT | RETRY |
| `DataAccessResourceFailureException` | Network issue, DB unavailable temporarily | TRANSIENT | RETRY |
| `QueryTimeoutException` | Query took too long | TRANSIENT | RETRY (with lower timeout) |
| `DataIntegrityViolationException` | Unique key violation, constraint failure | FATAL | SKIP or FAIL |
| `BadSqlGrammarException` | SQL syntax error (should never happen) | FATAL | FAIL |
| `PermissionDeniedDataAccessException` | No SELECT permission | FATAL | FAIL |

---

## Option Analysis

Based on their answers, recommend one of these strategies:

### Option A: Lenient Strategy (Default for ETL)

**When to use**:
- Data quality issues expected (0.1% bad records)
- Transient DB errors possible but rare
- Job completion is critical
- Dead letters acceptable

**Configuration**:
```java
.faultTolerant()

// Skip invalid records
.skip(ValidationException.class)
.skip(DataIntegrityViolationException.class)
.skipLimit(50000)  // Allow 0.05% failure on 100M records

// Retry transient DB errors
.retry(DeadlockLoserDataAccessException.class)
.retry(CannotGetJdbcConnectionException.class)
.retryLimit(3)
.backOffPolicy(new ExponentialBackOffPolicy())
.backoffInitialDelay(100)      // 100ms
.backoffMultiplier(5.0)         // 100 → 500 → 2500ms
.backoffMaxDelay(5000)          // Cap at 5s

// No retry for skip exceptions
.noRetry(ValidationException.class)
.noRetry(DataIntegrityViolationException.class)
```

**Behavior**:
- Record fails validation → Skip (logged)
- Record hits database deadlock → Retry up to 3 times
- Skip threshold exceeded → Job fails
- Job failure → Partially written CSV + dead letters file for review

**Best for**: Most ETL scenarios

---

### Option B: Strict Strategy (High data quality expected)

**When to use**:
- Data is very clean (no invalid records expected)
- Transient errors should not happen
- One bad record = investigate why

**Configuration**:
```java
// No skip policy
// No retry policy
// Fail on first error
```

**Behavior**:
- Any validation error → Job fails
- Any database error → Job fails
- Debug required to understand failure

**Not recommended for 100M records** (too fragile).

---

### Option C: Aggressive Retry Strategy (Poor DB stability)

**When to use**:
- Database frequently has transient issues
- Want to maximize job completion despite DB instability
- Willing to wait longer for retries

**Configuration**:
```java
.retry(DeadlockLoserDataAccessException.class)
.retry(CannotGetJdbcConnectionException.class)
.retry(DataAccessResourceFailureException.class)
.retryLimit(5)                   // More retries
.backOffPolicy(new ExponentialBackOffPolicy())
.backoffInitialDelay(500)        // Start at 500ms
.backoffMultiplier(3.0)
.backoffMaxDelay(10000)          // Cap at 10s
```

**Trade-off**: Job takes longer (multiple retries), but more resilient.

---

## Dead Letter File Design

**What to include**:

```java
@Data
@Builder
public class DeadLetterRecord {
    String originalData;           // The CSV line that failed
    String errorType;              // Exception class name
    String errorReason;            // Exception message
    String failedField;            // Which field caused failure
    LocalDateTime timestamp;       // When it failed
    String partitionId;            // Which partition
    Integer attemptNumber;         // Retry attempt count
    String stepName;               // Which step (READ/PROCESS/WRITE)
}
```

**Example dead letter file**:
```csv
originalData,errorType,errorReason,failedField,timestamp,partitionId
"1,John Doe,john@example.com,...","ValidationException","Email invalid format","email","2026-01-25T14:30:00","partition_001"
"2,Jane Smith,jane@example.com,...","DataIntegrityViolationException","Unique constraint violation","customer_id","2026-01-25T14:31:00","partition_001"
```

---

## Skip Listener Implementation

```java
@Component
@Slf4j
public class DeadLetterListener implements SkipListener<CustomerInput, CustomerOutput> {

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("Skipped in READ: {}", t.getMessage());
        // Log to dead letter file
    }

    @Override
    public void onSkipInProcess(CustomerInput item, Throwable t) {
        log.warn("Skipped in PROCESS: {} - {}", item.getId(), t.getMessage());
        // Write item to dead letter file
    }

    @Override
    public void onSkipInWrite(CustomerOutput item, Throwable t) {
        log.warn("Skipped in WRITE: {} - {}", item.getCustomerId(), t.getMessage());
        // Write item to dead letter file
    }
}
```

---

## ExecutionContext Tracking

```java
// In processor or writer listener:
public void onBeforeWrite(List<? extends CustomerOutput> items) {
    StepExecution stepExecution = StepSynchronizationManager.getContext().getStepExecution();
    long writeCount = (Long) stepExecution.getExecutionContext().getOrDefault("writeCount", 0L);

    stepExecution.getExecutionContext().put("writeCount", writeCount + items.size());
    stepExecution.getExecutionContext().put("lastWriteTime", LocalDateTime.now());
}
```

---

## Monitoring & Alerting

```yaml
metrics_to_monitor:
  job_level:
    - Status (COMPLETED, FAILED)
    - Total duration
    - Read count vs Write count mismatch = skips

  step_level:
    - Read count
    - Write count
    - Skip count (track in StepExecution)
    - Rollback count (if failures and retries)

  dead_letter_level:
    - Dead letter file size
    - Most common error types
    - Skip rate percentage

  alert_triggers:
    - Skip count > skip limit
    - Job fails
    - Dead letter file > threshold
    - Unknown exceptions
```

---

## Questions to Ask User

After presenting options, confirm:

- [ ] Skip exceptions? (ValidationException, DataIntegrityViolationException?)
- [ ] Skip limit? (50,000 for 100M records?)
- [ ] Retry exceptions? (DeadlockLoserDataAccessException, CannotGetJdbcConnectionException?)
- [ ] Retry count and backoff strategy?
- [ ] Dead letter file design?
- [ ] What constitutes job "success" with skips? (e.g., complete if skip < 1%)

**Document the decision in ADR-003: Fault Tolerance Strategy**

---

