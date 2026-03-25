# Chunk Processing Pattern Skill

**Purpose**: Core patterns for chunk-oriented batch processing in Spring Batch.

---

## Concept Overview

Chunk processing reads, processes, and writes data in configurable "chunks":

```
┌─────────────────────────────────────────────────────────────┐
│                    CHUNK (size = N)                         │
├─────────────────────────────────────────────────────────────┤
│  READ (N items) → PROCESS (N items) → WRITE (N items)       │
│       ↓                  ↓                  ↓                │
│   One at a time     One at a time      All at once          │
│                                        (single TX)           │
└─────────────────────────────────────────────────────────────┘
```

**Transaction boundary**: One commit per chunk, not per item.

---

## Basic Configuration

### Spring Batch 5.x Style

```java
@Configuration
@EnableBatchProcessing
public class ChunkJobConfig {

    @Bean
    public Job chunkJob(JobRepository jobRepository, Step chunkStep) {
        return new JobBuilder("chunkJob", jobRepository)
            .start(chunkStep)
            .build();
    }

    @Bean
    public Step chunkStep(JobRepository jobRepository,
                          PlatformTransactionManager transactionManager,
                          ItemReader<Input> reader,
                          ItemProcessor<Input, Output> processor,
                          ItemWriter<Output> writer) {
        return new StepBuilder("chunkStep", jobRepository)
            .<Input, Output>chunk(100, transactionManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
    }
}
```

---

## Chunk Size Selection

### Guidelines by Volume

| Volume | Records | Chunk Size | Rationale |
|--------|---------|------------|-----------|
| Small | < 10K | 100-500 | Quick commits, simple |
| Medium | 10K-1M | 500-1000 | Balance throughput/memory |
| Large | 1M-100M | 1000-5000 | Maximize throughput |
| Enterprise | > 100M | 5000-10000 | With partitioning |

### Factors to Consider

1. **Memory**: `chunk_size * object_size < available_heap`
2. **Transaction timeout**: Must complete within limit
3. **Commit frequency**: More commits = more restartability
4. **DB batch size**: Align with JDBC batch settings

### Dynamic Chunk Size

```java
@Bean
@StepScope
public Step dynamicChunkStep(
        @Value("#{jobParameters['chunkSize']}") Integer chunkSize) {
    return new StepBuilder("dynamicStep", jobRepository)
        .<Input, Output>chunk(chunkSize != null ? chunkSize : 1000, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .build();
}
```

---

## Reader Patterns

### Cursor-Based (Streaming)

```java
@Bean
@StepScope
public JdbcCursorItemReader<Input> cursorReader(DataSource ds) {
    return new JdbcCursorItemReaderBuilder<Input>()
        .name("cursorReader")
        .dataSource(ds)
        .sql("SELECT * FROM source WHERE status = 'PENDING' ORDER BY id")
        .rowMapper(new InputRowMapper())
        .fetchSize(1000)  // DB cursor fetch
        .build();
}
```

**Pros**: Memory efficient, single query
**Cons**: Holds DB connection, not restartable mid-chunk

### Page-Based (Restartable)

```java
@Bean
@StepScope
public JdbcPagingItemReader<Input> pagingReader(DataSource ds) {
    return new JdbcPagingItemReaderBuilder<Input>()
        .name("pagingReader")
        .dataSource(ds)
        .selectClause("SELECT *")
        .fromClause("FROM source")
        .whereClause("WHERE status = 'PENDING'")
        .sortKeys(Map.of("id", Order.ASCENDING))
        .pageSize(1000)  // Match chunk size
        .rowMapper(new InputRowMapper())
        .build();
}
```

**Pros**: Restartable, releases connection between pages
**Cons**: Multiple queries, sort key required

---

## Processor Patterns

### Simple Transformation

```java
@Component
public class TransformProcessor implements ItemProcessor<Input, Output> {

    @Override
    public Output process(Input item) throws Exception {
        // Return null to skip item
        if (!isValid(item)) {
            return null;
        }

        return Output.builder()
            .id(item.getId())
            .transformedField(transform(item.getField()))
            .build();
    }
}
```

### Composite Processor (Pipeline)

```java
@Bean
public CompositeItemProcessor<Input, Output> compositeProcessor() {
    return new CompositeItemProcessorBuilder<Input, Output>()
        .delegates(List.of(
            validationProcessor(),
            transformationProcessor(),
            enrichmentProcessor()
        ))
        .build();
}
```

### Validating Processor

```java
@Bean
public ValidatingItemProcessor<Input> validatingProcessor() {
    ValidatingItemProcessor<Input> processor = new ValidatingItemProcessor<>();
    processor.setValidator(new BeanValidatingItemProcessor<>());
    processor.setFilter(true);  // Skip invalid instead of fail
    return processor;
}
```

### Classifier-Based Routing

```java
@Bean
public ClassifierCompositeItemProcessor<Input, Output> classifierProcessor() {
    ClassifierCompositeItemProcessor<Input, Output> processor =
        new ClassifierCompositeItemProcessor<>();

    processor.setClassifier(new Classifier<Input, ItemProcessor<?, ? extends Output>>() {
        @Override
        public ItemProcessor<?, ? extends Output> classify(Input item) {
            return switch (item.getType()) {
                case "A" -> typeAProcessor;
                case "B" -> typeBProcessor;
                default -> defaultProcessor;
            };
        }
    });

    return processor;
}
```

---

## Writer Patterns

### Standard JDBC Writer

```java
@Bean
public JdbcBatchItemWriter<Output> jdbcWriter(DataSource ds) {
    return new JdbcBatchItemWriterBuilder<Output>()
        .dataSource(ds)
        .sql("INSERT INTO target (id, field) VALUES (:id, :field)")
        .beanMapped()
        .build();
}
```

### Composite Writer (Multiple Targets)

```java
@Bean
public CompositeItemWriter<Output> compositeWriter() {
    return new CompositeItemWriterBuilder<Output>()
        .delegates(List.of(
            databaseWriter(),
            fileWriter(),
            auditWriter()
        ))
        .build();
}
```

### Classifier-Based Writer

```java
@Bean
public ClassifierCompositeItemWriter<Output> classifierWriter() {
    ClassifierCompositeItemWriter<Output> writer = new ClassifierCompositeItemWriter<>();

    writer.setClassifier(new Classifier<Output, ItemWriter<? super Output>>() {
        @Override
        public ItemWriter<? super Output> classify(Output item) {
            return item.isValid() ? successWriter : errorWriter;
        }
    });

    return writer;
}
```

---

## Commit Interval Tuning

### Adaptive Commit Interval

```java
@Bean
public Step adaptiveStep() {
    return new StepBuilder("adaptiveStep", jobRepository)
        .<Input, Output>chunk(
            new SimpleCompletionPolicy(1000),  // Base chunk size
            transactionManager
        )
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .listener(new ChunkListener() {
            @Override
            public void afterChunk(ChunkContext context) {
                // Adjust based on performance
                long duration = /* measure duration */;
                if (duration > 5000) {
                    // Log warning, consider reducing chunk size
                }
            }
        })
        .build();
}
```

---

## Transaction Management

### Standard Configuration

```java
@Bean
public Step transactionalStep(PlatformTransactionManager txManager) {
    return new StepBuilder("txStep", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .transactionAttribute(new DefaultTransactionAttribute() {{
            setIsolationLevel(ISOLATION_READ_COMMITTED);
            setTimeout(300);  // 5 minutes
        }})
        .build();
}
```

### Non-Transactional Reader

```java
@Bean
public Step nonTxReaderStep() {
    return new StepBuilder("nonTxReader", jobRepository)
        .<Input, Output>chunk(100, txManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .readerIsTransactionalQueue()  // Reader outside TX
        .build();
}
```

---

## Listeners

### Chunk Listener

```java
@Component
public class ChunkMonitorListener implements ChunkListener {

    @Override
    public void beforeChunk(ChunkContext context) {
        log.debug("Starting chunk {}", context.getStepContext().getStepExecution().getCommitCount());
    }

    @Override
    public void afterChunk(ChunkContext context) {
        StepExecution step = context.getStepContext().getStepExecution();
        log.info("Chunk complete - Read: {}, Written: {}, Skipped: {}",
            step.getReadCount(), step.getWriteCount(), step.getSkipCount());
    }

    @Override
    public void afterChunkError(ChunkContext context) {
        log.error("Chunk failed: {}", context.getAttribute("exception"));
    }
}
```

### Item Listeners

```java
@Component
public class ItemMonitorListener implements ItemReadListener<Input>,
                                            ItemProcessListener<Input, Output>,
                                            ItemWriteListener<Output> {

    @Override
    public void onReadError(Exception ex) {
        log.error("Read error", ex);
    }

    @Override
    public void onProcessError(Input item, Exception ex) {
        log.error("Process error for item {}: {}", item.getId(), ex.getMessage());
    }

    @Override
    public void onWriteError(Exception ex, Chunk<? extends Output> items) {
        log.error("Write error for {} items", items.size(), ex);
    }
}
```

---

## Configuration Template

Complete chunk step configuration:

```java
@Bean
public Step completeChunkStep(
        JobRepository jobRepository,
        PlatformTransactionManager transactionManager) {

    return new StepBuilder("completeChunkStep", jobRepository)
        // Chunk configuration
        .<Input, Output>chunk(1000, transactionManager)

        // Core components
        .reader(reader())
        .processor(processor())
        .writer(writer())

        // Transaction settings
        .transactionAttribute(new DefaultTransactionAttribute() {{
            setTimeout(300);
        }})

        // Fault tolerance
        .faultTolerant()
        .skipLimit(100)
        .skip(ValidationException.class)
        .retryLimit(3)
        .retry(DeadlockLoserDataAccessException.class)

        // Listeners
        .listener(chunkListener())
        .listener(itemReadListener())
        .listener(itemWriteListener())

        // Build
        .build();
}
```

---

## Anti-Patterns to Avoid

1. **Stateful Processors**: Keep processors stateless
2. **Large Objects in Memory**: Stream don't collect
3. **Tiny Chunks**: Too many commits = slow
4. **Huge Chunks**: Risk timeouts and OOM
5. **Missing Order By**: Paging requires deterministic order
6. **Blocking Calls in Processor**: Use async patterns instead
