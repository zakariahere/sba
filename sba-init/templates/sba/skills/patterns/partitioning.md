# Partitioning Pattern Skill

**Purpose**: Parallel partitioning strategies for high-volume Spring Batch processing.

---

## Concept Overview

Partitioning divides data into chunks processed by parallel workers:

```
                    ┌─────────────────┐
                    │  Manager Step   │
                    │  (Partitioner)  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  Worker 1   │   │  Worker 2   │   │  Worker N   │
    │ (Partition) │   │ (Partition) │   │ (Partition) │
    │  ID: 1-1000 │   │ ID:1001-2000│   │ ID:N*1000+  │
    └─────────────┘   └─────────────┘   └─────────────┘
```

---

## Basic Configuration

### Partitioned Step Setup

```java
@Configuration
public class PartitionedJobConfig {

    @Bean
    public Job partitionedJob(JobRepository jobRepository, Step partitionedStep) {
        return new JobBuilder("partitionedJob", jobRepository)
            .start(partitionedStep)
            .build();
    }

    @Bean
    public Step partitionedStep(JobRepository jobRepository,
                                Partitioner partitioner,
                                Step workerStep,
                                TaskExecutor taskExecutor) {
        return new StepBuilder("partitionedStep", jobRepository)
            .partitioner("workerStep", partitioner)
            .step(workerStep)
            .gridSize(10)  // Number of partitions
            .taskExecutor(taskExecutor)
            .build();
    }

    @Bean
    @StepScope
    public Step workerStep(JobRepository jobRepository,
                           PlatformTransactionManager txManager,
                           @Value("#{stepExecutionContext['minId']}") Long minId,
                           @Value("#{stepExecutionContext['maxId']}") Long maxId) {
        return new StepBuilder("workerStep", jobRepository)
            .<Input, Output>chunk(1000, txManager)
            .reader(partitionedReader(minId, maxId))
            .processor(processor())
            .writer(writer())
            .build();
    }
}
```

---

## Partitioner Implementations

### Range Partitioner (ID-Based)

```java
@Component
public class IdRangePartitioner implements Partitioner {

    private final JdbcTemplate jdbcTemplate;

    public IdRangePartitioner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        // Get total range
        Long[] range = jdbcTemplate.queryForObject(
            "SELECT MIN(id), MAX(id) FROM source_table WHERE status = 'PENDING'",
            (rs, rowNum) -> new Long[]{rs.getLong(1), rs.getLong(2)}
        );

        if (range == null || range[0] == null) {
            return partitions;  // No data to process
        }

        long min = range[0];
        long max = range[1];
        long targetSize = (max - min) / gridSize + 1;

        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            long partitionMin = min + (i * targetSize);
            long partitionMax = Math.min(min + ((i + 1) * targetSize) - 1, max);

            context.putLong("minId", partitionMin);
            context.putLong("maxId", partitionMax);
            context.putString("partitionName", "partition" + i);

            partitions.put("partition" + i, context);
        }

        return partitions;
    }
}
```

### Column Value Partitioner

```java
@Component
public class ColumnValuePartitioner implements Partitioner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        // Get distinct values to partition by
        List<String> regions = jdbcTemplate.queryForList(
            "SELECT DISTINCT region FROM source_table WHERE status = 'PENDING'",
            String.class
        );

        for (String region : regions) {
            ExecutionContext context = new ExecutionContext();
            context.putString("region", region);
            partitions.put("partition_" + region, context);
        }

        return partitions;
    }
}
```

### Date Range Partitioner

```java
@Component
public class DateRangePartitioner implements Partitioner {

    @Value("${batch.partition.start-date}")
    private LocalDate startDate;

    @Value("${batch.partition.end-date}")
    private LocalDate endDate;

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        long daysPerPartition = totalDays / gridSize + 1;

        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            LocalDate partitionStart = startDate.plusDays(i * daysPerPartition);
            LocalDate partitionEnd = startDate.plusDays((i + 1) * daysPerPartition - 1);

            if (partitionStart.isAfter(endDate)) break;
            if (partitionEnd.isAfter(endDate)) partitionEnd = endDate;

            context.putString("startDate", partitionStart.toString());
            context.putString("endDate", partitionEnd.toString());

            partitions.put("partition_" + i, context);
        }

        return partitions;
    }
}
```

### Modulo Partitioner

```java
@Component
public class ModuloPartitioner implements Partitioner {

    @Override
    public Map<String, ExecutionContext> partition(int gridSize) {
        Map<String, ExecutionContext> partitions = new HashMap<>();

        for (int i = 0; i < gridSize; i++) {
            ExecutionContext context = new ExecutionContext();
            context.putInt("modValue", i);
            context.putInt("modBase", gridSize);
            partitions.put("partition" + i, context);
        }

        return partitions;
    }
}

// Reader uses: WHERE MOD(id, :modBase) = :modValue
```

---

## Task Executor Configuration

### Thread Pool Task Executor

```java
@Bean
public TaskExecutor partitionTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(10);
    executor.setMaxPoolSize(20);
    executor.setQueueCapacity(50);
    executor.setThreadNamePrefix("partition-worker-");
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

---

## Partitioned Reader

### Range-Based Reader

```java
@Bean
@StepScope
public JdbcPagingItemReader<Input> partitionedReader(
        DataSource dataSource,
        @Value("#{stepExecutionContext['minId']}") Long minId,
        @Value("#{stepExecutionContext['maxId']}") Long maxId) {

    return new JdbcPagingItemReaderBuilder<Input>()
        .name("partitionedReader")
        .dataSource(dataSource)
        .selectClause("SELECT id, field1, field2")
        .fromClause("FROM source_table")
        .whereClause("WHERE id >= :minId AND id <= :maxId AND status = 'PENDING'")
        .sortKeys(Map.of("id", Order.ASCENDING))
        .parameterValues(Map.of("minId", minId, "maxId", maxId))
        .pageSize(1000)
        .rowMapper(new InputRowMapper())
        .build();
}
```

### Column-Based Reader

```java
@Bean
@StepScope
public JdbcPagingItemReader<Input> regionReader(
        DataSource dataSource,
        @Value("#{stepExecutionContext['region']}") String region) {

    return new JdbcPagingItemReaderBuilder<Input>()
        .name("regionReader")
        .dataSource(dataSource)
        .selectClause("SELECT id, field1, field2")
        .fromClause("FROM source_table")
        .whereClause("WHERE region = :region AND status = 'PENDING'")
        .sortKeys(Map.of("id", Order.ASCENDING))
        .parameterValues(Map.of("region", region))
        .pageSize(1000)
        .rowMapper(new InputRowMapper())
        .build();
}
```

---

## Aggregation Handler

### Aggregating Results

```java
@Component
public class PartitionAggregator implements StepExecutionAggregator {

    @Override
    public void aggregate(StepExecution result, Collection<StepExecution> executions) {
        long readCount = 0;
        long writeCount = 0;
        long skipCount = 0;

        for (StepExecution execution : executions) {
            readCount += execution.getReadCount();
            writeCount += execution.getWriteCount();
            skipCount += execution.getSkipCount();

            // Merge failures
            result.getFailureExceptions().addAll(execution.getFailureExceptions());
        }

        result.setReadCount(readCount);
        result.setWriteCount(writeCount);
        result.setSkipCount(skipCount);
    }
}
```

### Configuration with Aggregator

```java
@Bean
public Step partitionedStep(JobRepository jobRepository,
                            Partitioner partitioner,
                            Step workerStep,
                            TaskExecutor taskExecutor,
                            StepExecutionAggregator aggregator) {
    return new StepBuilder("partitionedStep", jobRepository)
        .partitioner("workerStep", partitioner)
        .step(workerStep)
        .gridSize(10)
        .taskExecutor(taskExecutor)
        .aggregator(aggregator)
        .build();
}
```

---

## Grid Size Calculation

### Dynamic Grid Size

```java
@Component
public class DynamicGridSizePartitioner implements Partitioner {

    private final JdbcTemplate jdbcTemplate;

    @Value("${batch.partition.records-per-partition:100000}")
    private long recordsPerPartition;

    @Override
    public Map<String, ExecutionContext> partition(int suggestedGridSize) {
        // Calculate based on data volume
        Long totalRecords = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM source_table WHERE status = 'PENDING'",
            Long.class
        );

        int actualGridSize = Math.max(1,
            (int) Math.ceil((double) totalRecords / recordsPerPartition));

        // Cap at reasonable maximum
        actualGridSize = Math.min(actualGridSize, 20);

        // Create partitions with calculated size
        return createPartitions(actualGridSize);
    }
}
```

---

## Fault Tolerance in Partitions

### Partition Handler with Retry

```java
@Bean
public Step partitionedStepWithFaultTolerance(
        JobRepository jobRepository,
        Partitioner partitioner,
        Step workerStep,
        TaskExecutor taskExecutor) {

    return new StepBuilder("partitionedStep", jobRepository)
        .partitioner("workerStep", partitioner)
        .step(workerStep)
        .gridSize(10)
        .taskExecutor(taskExecutor)
        .allowStartIfComplete(true)  // Allow re-run of completed partitions
        .build();
}

@Bean
@StepScope
public Step workerStepWithFaultTolerance(JobRepository jobRepository,
                                         PlatformTransactionManager txManager) {
    return new StepBuilder("workerStep", jobRepository)
        .<Input, Output>chunk(1000, txManager)
        .reader(partitionedReader(null, null))
        .processor(processor())
        .writer(writer())
        .faultTolerant()
        .skipLimit(100)
        .skip(ValidationException.class)
        .retryLimit(3)
        .retry(DeadlockLoserDataAccessException.class)
        .build();
}
```

---

## Monitoring Partitions

### Partition Listener

```java
@Component
public class PartitionListener implements StepExecutionListener {

    @Override
    public void beforeStep(StepExecution stepExecution) {
        String partitionName = stepExecution.getExecutionContext()
            .getString("partitionName", "unknown");
        log.info("Starting partition: {}", partitionName);
    }

    @Override
    public ExitStatus afterStep(StepExecution stepExecution) {
        String partitionName = stepExecution.getExecutionContext()
            .getString("partitionName", "unknown");

        log.info("Completed partition: {} | Read: {} | Written: {} | Skipped: {}",
            partitionName,
            stepExecution.getReadCount(),
            stepExecution.getWriteCount(),
            stepExecution.getSkipCount());

        return stepExecution.getExitStatus();
    }
}
```

### Progress Tracking

```java
@Component
public class PartitionProgressTracker {

    private final ConcurrentMap<String, PartitionProgress> progressMap =
        new ConcurrentHashMap<>();

    public void updateProgress(String partitionId, long processed, long total) {
        progressMap.put(partitionId, new PartitionProgress(processed, total));
    }

    public double getOverallProgress() {
        long totalProcessed = progressMap.values().stream()
            .mapToLong(PartitionProgress::processed).sum();
        long total = progressMap.values().stream()
            .mapToLong(PartitionProgress::total).sum();

        return total > 0 ? (double) totalProcessed / total * 100 : 0;
    }

    record PartitionProgress(long processed, long total) {}
}
```

---

## Best Practices

### 1. Grid Size Guidelines

| Total Records | Suggested Grid Size | Workers |
|--------------|---------------------|---------|
| < 100K | 2-4 | 2-4 |
| 100K - 1M | 4-8 | 4-8 |
| 1M - 10M | 8-16 | 8-16 |
| > 10M | 16-32 | 16-32 |

### 2. Avoid Hotspots

```java
// BAD: Uneven distribution
WHERE status = 'PENDING' AND type = :type  // Some types may have 90% of data

// GOOD: Balanced distribution
WHERE id BETWEEN :minId AND :maxId  // Even ID ranges
```

### 3. Connection Pool Sizing

```
Pool Size = Grid Size + Manager Thread + Buffer
Example: 10 workers + 1 manager + 2 buffer = 13 connections
```

### 4. Memory Considerations

```
Memory per worker = Chunk Size × Object Size × 2 (read + write buffers)
Total Memory = Workers × Memory per worker + Overhead
```

---

## Anti-Patterns

1. **Too Many Partitions**: More partitions than CPU cores
2. **Unbalanced Partitions**: 90% of data in one partition
3. **Shared State**: Workers sharing mutable state
4. **Small Partitions**: Partition overhead exceeds benefit
5. **No Aggregation**: Losing partition-level metrics
