# Multi-Threaded Step Skill

**Purpose**: Patterns for multi-threaded step execution within a single JVM.

---

## Concept Overview

Multi-threading processes chunks in parallel within a single step:

```
                    ┌─────────────────────┐
                    │       STEP          │
                    │  (Task Executor)    │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ┌───────────┐         ┌───────────┐         ┌───────────┐
  │  Thread 1 │         │  Thread 2 │         │  Thread N │
  │  Chunk A  │         │  Chunk B  │         │  Chunk N  │
  └───────────┘         └───────────┘         └───────────┘
```

**Key Difference from Partitioning**:
- Partitioning: Each partition has its own reader instance
- Multi-threading: Single reader, parallel processing/writing

---

## Basic Configuration

```java
@Configuration
public class MultiThreadedJobConfig {

    @Bean
    public Job multiThreadedJob(JobRepository jobRepository, Step multiThreadedStep) {
        return new JobBuilder("multiThreadedJob", jobRepository)
            .start(multiThreadedStep)
            .build();
    }

    @Bean
    public Step multiThreadedStep(JobRepository jobRepository,
                                  PlatformTransactionManager txManager,
                                  TaskExecutor taskExecutor) {
        return new StepBuilder("multiThreadedStep", jobRepository)
            .<Input, Output>chunk(100, txManager)
            .reader(synchronizedReader())
            .processor(processor())
            .writer(writer())
            .taskExecutor(taskExecutor)
            .throttleLimit(10)  // Max concurrent threads
            .build();
    }

    @Bean
    public TaskExecutor stepTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("batch-thread-");
        executor.initialize();
        return executor;
    }
}
```

---

## Thread-Safe Readers

### Synchronized Reader Wrapper

```java
@Bean
public SynchronizedItemStreamReader<Input> synchronizedReader() {
    JdbcCursorItemReader<Input> reader = new JdbcCursorItemReaderBuilder<Input>()
        .name("cursorReader")
        .dataSource(dataSource)
        .sql("SELECT * FROM source_table WHERE status = 'PENDING' ORDER BY id")
        .rowMapper(new InputRowMapper())
        .build();

    SynchronizedItemStreamReader<Input> synchronizedReader =
        new SynchronizedItemStreamReader<>();
    synchronizedReader.setDelegate(reader);
    return synchronizedReader;
}
```

### Thread-Safe Paging Reader

```java
@Bean
public JdbcPagingItemReader<Input> threadSafePagingReader(DataSource dataSource) {
    JdbcPagingItemReader<Input> reader = new JdbcPagingItemReaderBuilder<Input>()
        .name("pagingReader")
        .dataSource(dataSource)
        .selectClause("SELECT id, field1, field2")
        .fromClause("FROM source_table")
        .whereClause("WHERE status = 'PENDING'")
        .sortKeys(Map.of("id", Order.ASCENDING))
        .pageSize(1000)
        .rowMapper(new InputRowMapper())
        .saveState(false)  // Important for thread safety
        .build();

    return reader;
}
```

---

## Thread-Safe Processors

### Stateless Processor (Recommended)

```java
@Component
public class StatelessProcessor implements ItemProcessor<Input, Output> {

    // No instance variables that hold state
    private final ExternalService externalService;  // OK if thread-safe

    @Override
    public Output process(Input item) throws Exception {
        // All work done with local variables
        String transformed = transform(item.getField());
        return Output.builder()
            .id(item.getId())
            .field(transformed)
            .build();
    }

    private String transform(String input) {
        // Pure function - no side effects
        return input.toUpperCase();
    }
}
```

### Thread-Local State (When Needed)

```java
@Component
public class ThreadLocalProcessor implements ItemProcessor<Input, Output> {

    private final ThreadLocal<SimpleDateFormat> dateFormatter =
        ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd"));

    @Override
    public Output process(Input item) throws Exception {
        // Each thread has its own formatter instance
        String formattedDate = dateFormatter.get().format(item.getDate());
        return Output.builder()
            .id(item.getId())
            .formattedDate(formattedDate)
            .build();
    }
}
```

---

## Thread-Safe Writers

### Standard JDBC Writer

```java
@Bean
public JdbcBatchItemWriter<Output> threadSafeWriter(DataSource dataSource) {
    // JdbcBatchItemWriter is thread-safe by default
    return new JdbcBatchItemWriterBuilder<Output>()
        .dataSource(dataSource)
        .sql("INSERT INTO target_table (id, field) VALUES (:id, :field)")
        .beanMapped()
        .build();
}
```

### JPA Writer with Thread Safety

```java
@Bean
public JpaItemWriter<Output> jpaWriter(EntityManagerFactory emf) {
    JpaItemWriter<Output> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    // Each thread gets its own EntityManager from the factory
    return writer;
}
```

### Synchronized Writer Wrapper

```java
@Component
public class SynchronizedFileWriter implements ItemWriter<Output> {

    private final FlatFileItemWriter<Output> delegate;
    private final Object lock = new Object();

    @Override
    public void write(Chunk<? extends Output> chunk) throws Exception {
        synchronized (lock) {
            delegate.write(chunk);
        }
    }
}
```

---

## Task Executor Configuration

### Basic Thread Pool

```java
@Bean
public TaskExecutor taskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(10);
    executor.setMaxPoolSize(20);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("batch-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(60);
    executor.initialize();
    return executor;
}
```

### Virtual Threads (Java 21+)

```java
@Bean
public TaskExecutor virtualThreadExecutor() {
    return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
}
```

### Custom Thread Factory

```java
@Bean
public TaskExecutor customExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(10);
    executor.setThreadFactory(r -> {
        Thread t = new Thread(r);
        t.setName("batch-worker-" + t.getId());
        t.setUncaughtExceptionHandler((thread, ex) ->
            log.error("Uncaught exception in {}: {}", thread.getName(), ex.getMessage()));
        return t;
    });
    executor.initialize();
    return executor;
}
```

---

## Throttle Limit

```java
@Bean
public Step throttledStep(JobRepository jobRepository,
                          PlatformTransactionManager txManager,
                          TaskExecutor taskExecutor) {
    return new StepBuilder("throttledStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(synchronizedReader())
        .processor(processor())
        .writer(writer())
        .taskExecutor(taskExecutor)
        .throttleLimit(8)  // Max 8 concurrent chunks
        .build();
}
```

**Throttle Limit Guidelines**:
- CPU-bound: Number of CPU cores
- I/O-bound: 2-4x CPU cores
- Database: Consider connection pool size

---

## State Management

### Step Scoped Beans

```java
@Bean
@StepScope
public ItemProcessor<Input, Output> stepScopedProcessor(
        @Value("#{stepExecution.jobExecution.id}") Long jobExecutionId) {

    // New instance per step execution, not per thread
    return item -> {
        // Safe to use jobExecutionId
        return process(item, jobExecutionId);
    };
}
```

### Execution Context (Not Thread-Safe!)

```java
// WARNING: ExecutionContext is NOT thread-safe
// Don't update it from multiple threads

// WRONG:
@Override
public Output process(Input item) {
    stepExecution.getExecutionContext().putLong("count",
        stepExecution.getExecutionContext().getLong("count") + 1);  // Race condition!
}

// RIGHT: Use atomic counters
private final AtomicLong counter = new AtomicLong();

@Override
public Output process(Input item) {
    counter.incrementAndGet();  // Thread-safe
}

@AfterStep
public void afterStep(StepExecution stepExecution) {
    stepExecution.getExecutionContext().putLong("count", counter.get());
}
```

---

## Connection Pool Sizing

```yaml
spring:
  datasource:
    hikari:
      # Pool size should accommodate:
      # - Throttle limit (for writers)
      # - Reader connection
      # - Spring Batch metadata operations
      maximum-pool-size: 15  # throttleLimit(10) + buffer
      minimum-idle: 5
```

**Formula**:
```
Pool Size >= Throttle Limit + 2 (reader + metadata)
```

---

## Fault Tolerance with Multi-Threading

```java
@Bean
public Step faultTolerantMultiThreadedStep(
        JobRepository jobRepository,
        PlatformTransactionManager txManager,
        TaskExecutor taskExecutor) {

    return new StepBuilder("faultTolerantStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(synchronizedReader())
        .processor(processor())
        .writer(writer())
        .taskExecutor(taskExecutor)
        .throttleLimit(10)
        .faultTolerant()
        .skipLimit(100)
        .skip(ValidationException.class)
        .retryLimit(3)
        .retry(DeadlockLoserDataAccessException.class)
        .build();
}
```

---

## Monitoring Multi-Threaded Steps

### Thread Monitoring Listener

```java
@Component
@Slf4j
public class ThreadMonitorListener implements ChunkListener {

    private final ConcurrentMap<String, Long> threadStartTimes = new ConcurrentHashMap<>();

    @Override
    public void beforeChunk(ChunkContext context) {
        String threadName = Thread.currentThread().getName();
        threadStartTimes.put(threadName, System.currentTimeMillis());
        log.debug("Thread {} starting chunk", threadName);
    }

    @Override
    public void afterChunk(ChunkContext context) {
        String threadName = Thread.currentThread().getName();
        Long startTime = threadStartTimes.remove(threadName);
        if (startTime != null) {
            long duration = System.currentTimeMillis() - startTime;
            log.debug("Thread {} completed chunk in {}ms", threadName, duration);
        }
    }
}
```

### Active Thread Gauge

```java
@Component
public class ThreadPoolMetrics {

    private final ThreadPoolTaskExecutor taskExecutor;
    private final MeterRegistry meterRegistry;

    @PostConstruct
    public void registerMetrics() {
        meterRegistry.gauge("batch.threads.active",
            taskExecutor, ThreadPoolTaskExecutor::getActiveCount);
        meterRegistry.gauge("batch.threads.pool.size",
            taskExecutor, ThreadPoolTaskExecutor::getPoolSize);
        meterRegistry.gauge("batch.threads.queue.size",
            taskExecutor, e -> e.getThreadPoolExecutor().getQueue().size());
    }
}
```

---

## Common Pitfalls

### 1. Non-Thread-Safe Reader

```java
// WRONG: Standard reader without synchronization
@Bean
public JdbcCursorItemReader<Input> unsafeReader() {
    return new JdbcCursorItemReaderBuilder<>()...build();
}

// RIGHT: Wrapped in synchronized reader
@Bean
public SynchronizedItemStreamReader<Input> safeReader() {
    SynchronizedItemStreamReader<Input> reader = new SynchronizedItemStreamReader<>();
    reader.setDelegate(jdbcCursorItemReader());
    return reader;
}
```

### 2. Mutable Shared State

```java
// WRONG: Shared mutable state
private List<String> processedIds = new ArrayList<>();  // Not thread-safe!

// RIGHT: Thread-safe collection
private final Set<String> processedIds = ConcurrentHashMap.newKeySet();
```

### 3. Non-Thread-Safe Date Formatter

```java
// WRONG: Shared SimpleDateFormat
private final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");  // Not thread-safe!

// RIGHT: DateTimeFormatter (thread-safe)
private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");

// OR ThreadLocal
private final ThreadLocal<SimpleDateFormat> sdf = ThreadLocal.withInitial(
    () -> new SimpleDateFormat("yyyy-MM-dd"));
```

### 4. Savestate with Multi-Threading

```java
// WRONG: saveState=true with multi-threading (causes issues on restart)
.reader(pagingReader())  // Default saveState=true

// RIGHT: Disable saveState for multi-threaded steps
.reader(pagingReaderBuilder().saveState(false).build())
```

---

## When to Use Multi-Threading vs Partitioning

| Aspect | Multi-Threading | Partitioning |
|--------|----------------|--------------|
| Reader instances | 1 (shared) | N (one per partition) |
| Scalability | Single JVM | Can scale to multiple JVMs |
| Restartability | Limited | Full restart support |
| Complexity | Lower | Higher |
| Best for | I/O-bound processing | Data-parallelism |

---

## Best Practices

1. **Always Use SynchronizedItemStreamReader**: For cursor-based readers
2. **Keep Processors Stateless**: No shared mutable state
3. **Set saveState=false**: For paging readers in multi-threaded steps
4. **Size Connection Pool**: Account for throttle limit
5. **Monitor Thread Usage**: Track active threads and queue depth
6. **Handle Errors Gracefully**: Configure skip/retry appropriately
