# Listeners Pattern Skill

**Purpose**: Listener patterns for monitoring, logging, and intercepting batch operations.

---

## Listener Hierarchy

```
JobExecutionListener        → Job level events
  └── StepExecutionListener → Step level events
        ├── ChunkListener   → Chunk level events
        ├── ItemReadListener  → Read events
        ├── ItemProcessListener → Process events
        └── ItemWriteListener   → Write events
            └── SkipListener    → Skip events
            └── RetryListener   → Retry events
```

---

## Job Execution Listener

### Basic Job Listener

```java
@Component
@Slf4j
public class JobCompletionListener implements JobExecutionListener {

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("========================================");
        log.info("Job '{}' starting", jobExecution.getJobInstance().getJobName());
        log.info("Parameters: {}", jobExecution.getJobParameters());
        log.info("========================================");
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        long duration = Duration.between(
            jobExecution.getStartTime(),
            jobExecution.getEndTime()
        ).toMillis();

        log.info("========================================");
        log.info("Job '{}' completed", jobExecution.getJobInstance().getJobName());
        log.info("Status: {}", jobExecution.getStatus());
        log.info("Duration: {}ms", duration);

        if (jobExecution.getStatus() == BatchStatus.COMPLETED) {
            logStepSummaries(jobExecution);
        } else {
            logFailures(jobExecution);
        }
        log.info("========================================");
    }

    private void logStepSummaries(JobExecution jobExecution) {
        for (StepExecution step : jobExecution.getStepExecutions()) {
            log.info("Step '{}': read={}, written={}, skipped={}",
                step.getStepName(),
                step.getReadCount(),
                step.getWriteCount(),
                step.getSkipCount());
        }
    }

    private void logFailures(JobExecution jobExecution) {
        for (Throwable failure : jobExecution.getAllFailureExceptions()) {
            log.error("Failure: {}", failure.getMessage(), failure);
        }
    }
}
```

### Notification Listener

```java
@Component
public class JobNotificationListener implements JobExecutionListener {

    private final NotificationService notificationService;
    private final MeterRegistry meterRegistry;

    @Override
    public void afterJob(JobExecution jobExecution) {
        String jobName = jobExecution.getJobInstance().getJobName();

        // Record metrics
        meterRegistry.counter("batch.job.completed",
            "job", jobName,
            "status", jobExecution.getStatus().name()
        ).increment();

        // Send notification on failure
        if (jobExecution.getStatus() == BatchStatus.FAILED) {
            notificationService.sendAlert(
                "Batch Job Failed: " + jobName,
                buildFailureMessage(jobExecution)
            );
        }
    }

    private String buildFailureMessage(JobExecution execution) {
        return String.format("Job: %s\nStatus: %s\nExceptions: %s",
            execution.getJobInstance().getJobName(),
            execution.getStatus(),
            execution.getAllFailureExceptions());
    }
}
```

---

## Step Execution Listener

### Step Monitoring Listener

```java
@Component
@Slf4j
public class StepMonitorListener implements StepExecutionListener {

    @Override
    public void beforeStep(StepExecution stepExecution) {
        log.info("Starting step: {}", stepExecution.getStepName());
    }

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        log.info("Step '{}' completed - Status: {}, Read: {}, Written: {}, Skipped: {}",
            stepExecution.getStepName(),
            stepExecution.getStatus(),
            stepExecution.getReadCount(),
            stepExecution.getWriteCount(),
            stepExecution.getSkipCount());

        // Customize exit status based on results
        if (stepExecution.getSkipCount() > 0) {
            return new ExitStatus("COMPLETED_WITH_SKIPS",
                "Skipped " + stepExecution.getSkipCount() + " items");
        }

        return stepExecution.getExitStatus();
    }
}
```

### Step Context Sharing Listener

```java
@Component
public class StepContextListener implements StepExecutionListener {

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        // Share data with subsequent steps via job execution context
        JobExecution jobExecution = stepExecution.getJobExecution();

        jobExecution.getExecutionContext().putLong(
            stepExecution.getStepName() + ".readCount",
            stepExecution.getReadCount()
        );

        jobExecution.getExecutionContext().putLong(
            stepExecution.getStepName() + ".writeCount",
            stepExecution.getWriteCount()
        );

        return stepExecution.getExitStatus();
    }
}
```

---

## Chunk Listener

### Chunk Progress Listener

```java
@Component
@Slf4j
public class ChunkProgressListener implements ChunkListener {

    private final AtomicLong chunkCount = new AtomicLong(0);
    private long startTime;

    @Override
    public void beforeChunk(ChunkContext context) {
        if (chunkCount.get() == 0) {
            startTime = System.currentTimeMillis();
        }
    }

    @Override
    public void afterChunk(ChunkContext context) {
        long count = chunkCount.incrementAndGet();
        StepExecution step = context.getStepContext().getStepExecution();

        if (count % 10 == 0) {  // Log every 10 chunks
            long elapsed = System.currentTimeMillis() - startTime;
            double rate = step.getWriteCount() / (elapsed / 1000.0);

            log.info("Progress: {} chunks, {} records written, {:.2f} records/sec",
                count, step.getWriteCount(), rate);
        }
    }

    @Override
    public void afterChunkError(ChunkContext context) {
        log.error("Chunk {} failed", chunkCount.get());
    }
}
```

### Transaction Timing Listener

```java
@Component
@Slf4j
public class TransactionTimingListener implements ChunkListener {

    private long chunkStartTime;

    @Override
    public void beforeChunk(ChunkContext context) {
        chunkStartTime = System.currentTimeMillis();
    }

    @Override
    public void afterChunk(ChunkContext context) {
        long duration = System.currentTimeMillis() - chunkStartTime;

        if (duration > 5000) {  // Warn if chunk takes > 5 seconds
            log.warn("Slow chunk detected: {}ms", duration);
        }

        // Record metric
        Metrics.timer("batch.chunk.duration")
            .record(duration, TimeUnit.MILLISECONDS);
    }
}
```

---

## Item Listeners

### Item Read Listener

```java
@Component
@Slf4j
public class ItemReadListener<T> implements org.springframework.batch.core.ItemReadListener<T> {

    @Override
    public void beforeRead() {
        // Called before each read
    }

    @Override
    public void afterRead(T item) {
        log.trace("Read item: {}", item);
    }

    @Override
    public void onReadError(Exception ex) {
        log.error("Read error: {}", ex.getMessage());
    }
}
```

### Item Process Listener

```java
@Component
@Slf4j
public class ItemProcessListener<I, O>
        implements org.springframework.batch.core.ItemProcessListener<I, O> {

    @Override
    public void beforeProcess(I item) {
        log.trace("Processing item: {}", item);
    }

    @Override
    public void afterProcess(I input, O output) {
        if (output == null) {
            log.debug("Item filtered: {}", input);
        }
    }

    @Override
    public void onProcessError(I item, Exception e) {
        log.error("Error processing item {}: {}", item, e.getMessage());
    }
}
```

### Item Write Listener

```java
@Component
@Slf4j
public class ItemWriteListener<T>
        implements org.springframework.batch.core.ItemWriteListener<T> {

    @Override
    public void beforeWrite(Chunk<? extends T> items) {
        log.debug("Writing {} items", items.size());
    }

    @Override
    public void afterWrite(Chunk<? extends T> items) {
        log.debug("Successfully wrote {} items", items.size());
    }

    @Override
    public void onWriteError(Exception exception, Chunk<? extends T> items) {
        log.error("Error writing {} items: {}",
            items.size(), exception.getMessage());

        // Log individual items for debugging
        items.getItems().forEach(item ->
            log.error("Failed item: {}", item));
    }
}
```

---

## Skip Listener

### Skip Tracking Listener

```java
@Component
@Slf4j
public class SkipTrackingListener implements SkipListener<Input, Output> {

    private final SkippedItemRepository skippedItemRepository;

    @Override
    public void onSkipInRead(Throwable t) {
        log.warn("Skipped in read: {}", t.getMessage());
        skippedItemRepository.save(SkippedItem.builder()
            .phase("READ")
            .errorMessage(t.getMessage())
            .timestamp(LocalDateTime.now())
            .build());
    }

    @Override
    public void onSkipInProcess(Input item, Throwable t) {
        log.warn("Skipped in process - Item: {}, Error: {}", item, t.getMessage());
        skippedItemRepository.save(SkippedItem.builder()
            .phase("PROCESS")
            .itemData(item.toString())
            .errorMessage(t.getMessage())
            .timestamp(LocalDateTime.now())
            .build());
    }

    @Override
    public void onSkipInWrite(Output item, Throwable t) {
        log.warn("Skipped in write - Item: {}, Error: {}", item, t.getMessage());
        skippedItemRepository.save(SkippedItem.builder()
            .phase("WRITE")
            .itemData(item.toString())
            .errorMessage(t.getMessage())
            .timestamp(LocalDateTime.now())
            .build());
    }
}
```

---

## Retry Listener

```java
@Component
@Slf4j
public class RetryTrackingListener implements RetryListener {

    @Override
    public <T, E extends Throwable> boolean open(RetryContext context,
                                                  RetryCallback<T, E> callback) {
        return true;  // Allow retry
    }

    @Override
    public <T, E extends Throwable> void onError(RetryContext context,
                                                  RetryCallback<T, E> callback,
                                                  Throwable throwable) {
        log.warn("Retry attempt {} for: {}",
            context.getRetryCount(),
            throwable.getMessage());
    }

    @Override
    public <T, E extends Throwable> void close(RetryContext context,
                                                RetryCallback<T, E> callback,
                                                Throwable throwable) {
        if (throwable != null) {
            log.error("Retries exhausted after {} attempts: {}",
                context.getRetryCount(),
                throwable.getMessage());
        }
    }
}
```

---

## Composite Listener

### All-in-One Monitoring Listener

```java
@Component
@Slf4j
public class ComprehensiveListener implements
        JobExecutionListener,
        StepExecutionListener,
        ChunkListener,
        ItemReadListener<Object>,
        ItemWriteListener<Object>,
        SkipListener<Object, Object> {

    private final MeterRegistry meterRegistry;

    @Override
    public void beforeJob(JobExecution jobExecution) {
        meterRegistry.counter("batch.job.started",
            "job", jobExecution.getJobInstance().getJobName()).increment();
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        meterRegistry.counter("batch.job.completed",
            "job", jobExecution.getJobInstance().getJobName(),
            "status", jobExecution.getStatus().name()).increment();
    }

    @Override
    public void beforeStep(StepExecution stepExecution) {
        // Step tracking
    }

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        meterRegistry.gauge("batch.step.read.count",
            Tags.of("step", stepExecution.getStepName()),
            stepExecution.getReadCount());
        return stepExecution.getExitStatus();
    }

    // ... implement all methods
}
```

---

## Registering Listeners

### In Step Configuration

```java
@Bean
public Step monitoredStep(JobRepository jobRepository,
                          PlatformTransactionManager txManager,
                          StepExecutionListener stepListener,
                          ChunkListener chunkListener,
                          ItemReadListener<?> readListener,
                          ItemWriteListener<?> writeListener,
                          SkipListener<?, ?> skipListener) {

    return new StepBuilder("monitoredStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .listener(stepListener)
        .listener(chunkListener)
        .listener(readListener)
        .listener(writeListener)
        .listener(skipListener)
        .build();
}
```

### In Job Configuration

```java
@Bean
public Job monitoredJob(JobRepository jobRepository,
                        Step step,
                        JobExecutionListener jobListener) {
    return new JobBuilder("monitoredJob", jobRepository)
        .listener(jobListener)
        .start(step)
        .build();
}
```

---

## Annotation-Based Listeners

```java
@Component
public class AnnotatedListener {

    @BeforeJob
    public void beforeJob(JobExecution execution) {
        log.info("Job starting: {}", execution.getJobInstance().getJobName());
    }

    @AfterJob
    public void afterJob(JobExecution execution) {
        log.info("Job completed: {}", execution.getStatus());
    }

    @BeforeStep
    public void beforeStep(StepExecution execution) {
        log.info("Step starting: {}", execution.getStepName());
    }

    @AfterStep
    public ExitStatus afterStep(StepExecution execution) {
        log.info("Step completed: {}", execution.getStatus());
        return execution.getExitStatus();
    }

    @BeforeChunk
    public void beforeChunk(ChunkContext context) {
        log.debug("Chunk starting");
    }

    @AfterChunk
    public void afterChunk(ChunkContext context) {
        log.debug("Chunk completed");
    }

    @OnReadError
    public void onReadError(Exception ex) {
        log.error("Read error: {}", ex.getMessage());
    }

    @OnProcessError
    public void onProcessError(Object item, Exception ex) {
        log.error("Process error: {}", ex.getMessage());
    }

    @OnWriteError
    public void onWriteError(Exception ex, List<?> items) {
        log.error("Write error: {}", ex.getMessage());
    }

    @OnSkipInRead
    public void onSkipInRead(Throwable t) {
        log.warn("Skipped in read: {}", t.getMessage());
    }

    @OnSkipInProcess
    public void onSkipInProcess(Object item, Throwable t) {
        log.warn("Skipped in process: {}", t.getMessage());
    }

    @OnSkipInWrite
    public void onSkipInWrite(Object item, Throwable t) {
        log.warn("Skipped in write: {}", t.getMessage());
    }
}
```

---

## Best Practices

1. **Keep Listeners Lightweight**: Don't block processing
2. **Use Async for External Calls**: Notifications, API calls
3. **Log Appropriately**: DEBUG/TRACE for items, INFO for summaries
4. **Handle Exceptions**: Don't let listener failures crash the job
5. **Use Metrics**: Integrate with Micrometer for observability
