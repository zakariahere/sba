# Fault Tolerance Pattern Skill

**Purpose**: Skip, retry, and restart patterns for resilient Spring Batch jobs.

---

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FAULT TOLERANCE                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│      SKIP       │      RETRY      │       RESTART           │
├─────────────────┼─────────────────┼─────────────────────────┤
│ Bad data        │ Transient       │ Job failure             │
│ Validation fail │ Network issue   │ System crash            │
│ Missing refs    │ Deadlock        │ Maintenance window      │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## Skip Configuration

### Basic Skip Setup

```java
@Bean
public Step skipStep(JobRepository jobRepository,
                     PlatformTransactionManager txManager) {
    return new StepBuilder("skipStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skipLimit(100)                          // Max skips
        .skip(ValidationException.class)          // Skip this
        .skip(FlatFileParseException.class)
        .noSkip(FileNotFoundException.class)      // Never skip this
        .build();
}
```

### Skip Policy (Custom Logic)

```java
@Bean
public Step customSkipStep() {
    return new StepBuilder("customSkipStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skipPolicy(new SkipPolicy() {
            @Override
            public boolean shouldSkip(Throwable t, long skipCount) {
                // Custom logic
                if (t instanceof ValidationException) {
                    return skipCount < 100;  // Skip up to 100
                }
                if (t instanceof DataIntegrityViolationException) {
                    return skipCount < 50;   // Fewer for DB errors
                }
                return false;  // Don't skip unknown errors
            }
        })
        .build();
}
```

### Percentage-Based Skip Policy

```java
public class PercentageSkipPolicy implements SkipPolicy {

    private final double maxSkipPercentage;
    private final AtomicLong totalCount = new AtomicLong();
    private final AtomicLong skipCount = new AtomicLong();

    public PercentageSkipPolicy(double maxSkipPercentage) {
        this.maxSkipPercentage = maxSkipPercentage;
    }

    @Override
    public boolean shouldSkip(Throwable t, long skipCount) {
        if (!(t instanceof SkippableException)) {
            return false;
        }

        this.skipCount.incrementAndGet();
        double currentPercentage =
            (double) this.skipCount.get() / totalCount.get() * 100;

        return currentPercentage <= maxSkipPercentage;
    }

    public void incrementTotal() {
        totalCount.incrementAndGet();
    }
}
```

### Skip Listener (Tracking Skipped Items)

```java
@Component
public class SkipTrackingListener implements SkipListener<Input, Output> {

    private final SkippedItemRepository skippedItemRepo;

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("Skipped during read: {}", t.getMessage());
        skippedItemRepo.save(new SkippedItem(
            "READ", null, t.getMessage(), LocalDateTime.now()
        ));
    }

    @Override
    public void onSkipInProcess(Input item, Throwable t) {
        log.warn("Skipped during process - ID: {}, Error: {}",
            item.getId(), t.getMessage());
        skippedItemRepo.save(new SkippedItem(
            "PROCESS", item.getId(), t.getMessage(), LocalDateTime.now()
        ));
    }

    @Override
    public void onSkipInWrite(Output item, Throwable t) {
        log.warn("Skipped during write - ID: {}, Error: {}",
            item.getId(), t.getMessage());
        skippedItemRepo.save(new SkippedItem(
            "WRITE", item.getId(), t.getMessage(), LocalDateTime.now()
        ));
    }
}
```

---

## Retry Configuration

### Basic Retry Setup

```java
@Bean
public Step retryStep() {
    return new StepBuilder("retryStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .retryLimit(3)                                    // Max retries
        .retry(DeadlockLoserDataAccessException.class)    // Retry this
        .retry(TransientDataAccessException.class)
        .noRetry(ValidationException.class)               // Never retry
        .build();
}
```

### Retry with Backoff

```java
@Bean
public Step retryWithBackoffStep() {
    return new StepBuilder("retryBackoff", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .retryLimit(3)
        .retry(TransientDataAccessException.class)
        .backOffPolicy(new ExponentialBackOffPolicy() {{
            setInitialInterval(1000);   // 1 second
            setMultiplier(2.0);          // Double each time
            setMaxInterval(30000);       // Max 30 seconds
        }})
        .build();
}
```

### Custom Retry Policy

```java
public class SmartRetryPolicy implements RetryPolicy {

    private final int maxAttempts;
    private final Set<Class<? extends Throwable>> retryableExceptions;

    @Override
    public boolean canRetry(RetryContext context) {
        Throwable t = context.getLastThrowable();

        // Don't retry if max attempts reached
        if (context.getRetryCount() >= maxAttempts) {
            return false;
        }

        // Only retry known transient exceptions
        return retryableExceptions.stream()
            .anyMatch(ex -> ex.isInstance(t));
    }

    @Override
    public RetryContext open(RetryContext parent) {
        return new RetryContextSupport(parent);
    }

    @Override
    public void close(RetryContext context) {
        // Cleanup if needed
    }

    @Override
    public void registerThrowable(RetryContext context, Throwable t) {
        ((RetryContextSupport) context).registerThrowable(t);
    }
}
```

### Retry Listener

```java
@Component
public class RetryTrackingListener implements RetryListener {

    @Override
    public <T, E extends Throwable> boolean open(RetryContext context,
                                                  RetryCallback<T, E> callback) {
        log.debug("Retry context opened");
        return true;  // Proceed with retry
    }

    @Override
    public <T, E extends Throwable> void onError(RetryContext context,
                                                  RetryCallback<T, E> callback,
                                                  Throwable t) {
        log.warn("Retry attempt {} failed: {}",
            context.getRetryCount(), t.getMessage());
    }

    @Override
    public <T, E extends Throwable> void close(RetryContext context,
                                                RetryCallback<T, E> callback,
                                                Throwable t) {
        if (t != null) {
            log.error("All retries exhausted after {} attempts",
                context.getRetryCount());
        }
    }
}
```

---

## Restart Configuration

### Restartable Job

```java
@Bean
public Job restartableJob() {
    return new JobBuilder("restartableJob", jobRepository)
        .start(step1())
        .next(step2())
        .next(step3())
        .build();
    // Jobs are restartable by default
}
```

### Non-Restartable Job

```java
@Bean
public Job nonRestartableJob() {
    return new JobBuilder("nonRestartableJob", jobRepository)
        .start(step1())
        .preventRestart()  // Cannot restart
        .build();
}
```

### Step-Level Restart Control

```java
@Bean
public Step limitedRestartStep() {
    return new StepBuilder("limitedRestart", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .writer(writer())
        .startLimit(3)  // Max 3 start attempts
        .allowStartIfComplete(false)  // Don't re-run if completed
        .build();
}
```

### Execution Context for State

```java
@Component
@StepScope
public class StatefulReader implements ItemReader<Input>, ItemStream {

    private int currentIndex = 0;

    @Override
    public void open(ExecutionContext executionContext) {
        // Restore state on restart
        if (executionContext.containsKey("currentIndex")) {
            this.currentIndex = executionContext.getInt("currentIndex");
            log.info("Resuming from index: {}", currentIndex);
        }
    }

    @Override
    public void update(ExecutionContext executionContext) {
        // Save state for potential restart
        executionContext.putInt("currentIndex", currentIndex);
    }

    @Override
    public Input read() {
        // Read logic using currentIndex
        currentIndex++;
        return /* next item */;
    }

    @Override
    public void close() {
        // Cleanup
    }
}
```

---

## Combined Fault Tolerance

### Complete Configuration

```java
@Bean
public Step fullyFaultTolerantStep() {
    return new StepBuilder("faultTolerant", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .faultTolerant()

        // Skip configuration
        .skipLimit(100)
        .skip(ValidationException.class)
        .skip(DataIntegrityViolationException.class)

        // Retry configuration
        .retryLimit(3)
        .retry(DeadlockLoserDataAccessException.class)
        .retry(TransientDataAccessException.class)
        .backOffPolicy(new ExponentialBackOffPolicy())

        // What happens when retry exhausted?
        .noRollback(ValidationException.class)  // Don't rollback for validation

        // Listeners
        .listener(skipListener())
        .listener(retryListener())

        // Restart settings
        .startLimit(5)

        .build();
}
```

---

## Exception Hierarchy Guide

### Skip-Appropriate Exceptions
```java
// Data quality issues - safe to skip
ValidationException.class
ConstraintViolationException.class
DataIntegrityViolationException.class
FlatFileParseException.class
NumberFormatException.class
```

### Retry-Appropriate Exceptions
```java
// Transient issues - worth retrying
DeadlockLoserDataAccessException.class
CannotAcquireLockException.class
TransientDataAccessException.class
OptimisticLockingFailureException.class
SocketTimeoutException.class
ConnectException.class
```

### Never Skip/Retry
```java
// Fatal issues - fail the job
FileNotFoundException.class
OutOfMemoryError.class
StackOverflowError.class
SecurityException.class
```

---

## Monitoring Fault Tolerance

### Metrics Collection

```java
@Component
public class FaultToleranceMetrics implements StepExecutionListener {

    private final MeterRegistry meterRegistry;

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        String stepName = stepExecution.getStepName();

        meterRegistry.gauge("batch.skip.count",
            Tags.of("step", stepName),
            stepExecution.getSkipCount());

        meterRegistry.gauge("batch.rollback.count",
            Tags.of("step", stepName),
            stepExecution.getRollbackCount());

        return stepExecution.getExitStatus();
    }
}
```

### Alert Thresholds

```java
@Component
public class FaultToleranceAlertListener implements StepExecutionListener {

    private static final double SKIP_THRESHOLD = 0.05;  // 5%

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        long total = stepExecution.getReadCount();
        long skipped = stepExecution.getSkipCount();
        double skipRate = (double) skipped / total;

        if (skipRate > SKIP_THRESHOLD) {
            alertService.sendAlert(String.format(
                "High skip rate: %.2f%% (%d/%d) in step %s",
                skipRate * 100, skipped, total, stepExecution.getStepName()
            ));
        }

        return stepExecution.getExitStatus();
    }
}
```

---

## Decision Matrix

| Scenario | Skip | Retry | Restart |
|----------|------|-------|---------|
| Invalid data format | Yes | No | N/A |
| DB deadlock | No | Yes (3x) | N/A |
| Network timeout | No | Yes (5x) | N/A |
| Missing FK reference | Yes | No | N/A |
| OOM error | No | No | Yes |
| Server restart | No | No | Yes |
| Duplicate key | Yes | No | N/A |
| Constraint violation | Yes | No | N/A |

---

## Anti-Patterns

1. **Skipping everything**: Be selective about what to skip
2. **Infinite retries**: Always set limits
3. **No tracking**: Log/persist skipped items for review
4. **Retrying non-idempotent**: Only retry safe operations
5. **Large skip limits**: Indicates data quality issues
