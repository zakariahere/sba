# SBA Conventions and Standards

**Purpose**: Project conventions for Spring Batch applications designed with SBA.

---

## Project Structure

```
src/main/java/{package}/
├── config/                    # Job and step configurations
│   ├── {JobName}BatchConfig.java
│   └── BatchInfrastructureConfig.java
├── dto/                       # Data Transfer Objects
│   ├── {Name}Input.java       # Reader output types
│   └── {Name}Output.java      # Writer input types
├── entity/                    # JPA entities (if using JPA)
│   └── {Name}Entity.java
├── mapper/                    # Row mappers and MyBatis mappers
│   ├── {Name}RowMapper.java
│   └── {Name}Mapper.java      # MyBatis interface
├── reader/                    # Custom ItemReaders
│   └── {Name}ItemReader.java
├── processor/                 # ItemProcessors
│   └── {Name}ItemProcessor.java
├── writer/                    # Custom ItemWriters
│   └── {Name}ItemWriter.java
├── tasklet/                   # Tasklet implementations
│   └── {Name}Tasklet.java
├── listener/                  # Job/Step/Chunk listeners
│   ├── JobCompletionListener.java
│   └── {Name}Listener.java
├── partitioner/               # Partitioner implementations
│   └── {Name}Partitioner.java
├── validator/                 # Validation logic
│   └── {Name}Validator.java
├── decider/                   # Job flow deciders
│   └── {Name}Decider.java
└── exception/                 # Custom exceptions
    └── {Name}Exception.java

src/main/resources/
├── application.yml
├── application-{profile}.yml
├── mapper/                    # MyBatis XML mappers
│   └── {Name}Mapper.xml
└── db/
    └── migration/             # Flyway/Liquibase scripts

src/test/java/{package}/
├── config/
│   └── {JobName}BatchConfigTest.java
├── processor/
│   └── {Name}ItemProcessorTest.java
└── integration/
    └── {JobName}IntegrationTest.java
```

---

## Naming Conventions

### Classes

| Type | Pattern | Example |
|------|---------|---------|
| Job Config | `{JobName}BatchConfig` | `CustomerMigrationBatchConfig` |
| Step Bean | `{stepName}Step` | `extractCustomersStep` |
| Reader | `{name}Reader` or `{Name}ItemReader` | `customerReader` |
| Processor | `{Name}Processor` or `{Name}ItemProcessor` | `CustomerTransformProcessor` |
| Writer | `{name}Writer` or `{Name}ItemWriter` | `customerWriter` |
| Tasklet | `{Name}Tasklet` | `CleanupTasklet` |
| Listener | `{Name}Listener` | `JobCompletionListener` |
| Partitioner | `{Name}Partitioner` | `IdRangePartitioner` |
| Decider | `{Name}Decider` | `DataQualityDecider` |

### Methods

| Type | Pattern | Example |
|------|---------|---------|
| Job Bean | `{jobName}Job` | `customerMigrationJob` |
| Step Bean | `{stepName}Step` | `extractCustomersStep` |
| Reader Bean | `{name}Reader` | `customerCursorReader` |
| Processor Bean | `{name}Processor` | `customerTransformProcessor` |
| Writer Bean | `{name}Writer` | `customerJdbcWriter` |

### Database

| Type | Pattern | Example |
|------|---------|---------|
| Table | `snake_case` | `customer_data` |
| Column | `snake_case` | `created_at` |
| Index | `idx_{table}_{columns}` | `idx_customer_status` |
| Sequence | `{table}_seq` | `customer_data_seq` |

---

## Code Standards

### Configuration Classes

```java
@Configuration
@RequiredArgsConstructor
public class CustomerMigrationBatchConfig {

    // Inject dependencies via constructor
    private final JobRepository jobRepository;
    private final PlatformTransactionManager transactionManager;
    private final DataSource dataSource;

    // Job definition at top
    @Bean
    public Job customerMigrationJob(Step extractStep, Step transformStep) {
        return new JobBuilder("customerMigrationJob", jobRepository)
            .listener(jobCompletionListener())
            .start(extractStep)
            .next(transformStep)
            .build();
    }

    // Steps follow job
    @Bean
    public Step extractStep(ItemReader<CustomerInput> reader,
                            ItemProcessor<CustomerInput, CustomerOutput> processor,
                            ItemWriter<CustomerOutput> writer) {
        return new StepBuilder("extractStep", jobRepository)
            .<CustomerInput, CustomerOutput>chunk(1000, transactionManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
    }

    // Component beans at bottom
    @Bean
    @StepScope
    public JdbcCursorItemReader<CustomerInput> customerReader() {
        // ...
    }
}
```

### Processor Classes

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CustomerTransformProcessor
        implements ItemProcessor<CustomerInput, CustomerOutput> {

    private final ValidationService validationService;

    @Override
    public CustomerOutput process(CustomerInput item) throws Exception {
        log.debug("Processing customer: {}", item.getId());

        // Validate
        if (!validationService.isValid(item)) {
            log.warn("Invalid customer: {}", item.getId());
            return null;  // Skip
        }

        // Transform
        return CustomerOutput.builder()
            .id(item.getId())
            .name(item.getName().toUpperCase())
            .processedAt(LocalDateTime.now())
            .build();
    }
}
```

### DTO Classes

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CustomerInput {

    private Long id;
    private String name;
    private String email;
    private LocalDate createdAt;

    // Validation annotations if needed
    @NotNull
    @Size(max = 100)
    private String status;
}
```

---

## Configuration Properties

### application.yml Structure

```yaml
spring:
  application:
    name: batch-application

  batch:
    job:
      enabled: false  # Disable auto-run
    jdbc:
      initialize-schema: always

  datasource:
    url: ${DB_URL}
    username: ${DB_USER}
    password: ${DB_PASSWORD}

# Batch-specific configuration
batch:
  jobs:
    customer-migration:
      chunk-size: ${CHUNK_SIZE:1000}
      skip-limit: ${SKIP_LIMIT:100}
      retry-limit: ${RETRY_LIMIT:3}
      cron: ${BATCH_CRON:0 0 2 * * ?}

  threading:
    core-pool-size: ${THREAD_POOL_CORE:4}
    max-pool-size: ${THREAD_POOL_MAX:8}
    queue-capacity: ${THREAD_QUEUE:100}

# Logging
logging:
  level:
    org.springframework.batch: INFO
    com.company.batch: DEBUG
```

### Profile-Specific Configuration

```yaml
# application-dev.yml
spring:
  batch:
    jdbc:
      initialize-schema: always

batch:
  jobs:
    customer-migration:
      chunk-size: 100  # Smaller for dev

logging:
  level:
    org.springframework.batch: DEBUG
```

```yaml
# application-prod.yml
spring:
  batch:
    jdbc:
      initialize-schema: never

batch:
  jobs:
    customer-migration:
      chunk-size: 5000  # Larger for prod

logging:
  level:
    org.springframework.batch: WARN
```

---

## Error Handling Standards

### Exception Hierarchy

```java
// Base exception
public class BatchProcessingException extends RuntimeException {
    public BatchProcessingException(String message) {
        super(message);
    }
    public BatchProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}

// Skippable exception
public class ValidationException extends BatchProcessingException {
    private final Object item;
    // Used for skip policy
}

// Retryable exception
public class TransientProcessingException extends BatchProcessingException {
    // Used for retry policy
}

// Fatal exception
public class FatalProcessingException extends BatchProcessingException {
    // Should not be skipped or retried
}
```

### Standard Fault Tolerance Configuration

```java
.faultTolerant()
// Skip
.skipLimit(100)
.skip(ValidationException.class)
.skip(DataIntegrityViolationException.class)
.noSkip(FatalProcessingException.class)
// Retry
.retryLimit(3)
.retry(TransientProcessingException.class)
.retry(DeadlockLoserDataAccessException.class)
.noRetry(ValidationException.class)
// Backoff
.backOffPolicy(new ExponentialBackOffPolicy())
```

---

## Logging Standards

### Log Levels

| Level | Use Case |
|-------|----------|
| ERROR | Failures, exceptions that stop processing |
| WARN | Skipped items, degraded performance |
| INFO | Job/step start/end, summaries |
| DEBUG | Chunk progress, decision points |
| TRACE | Individual item processing |

### Standard Log Messages

```java
// Job level
log.info("Job '{}' starting with parameters: {}", jobName, params);
log.info("Job '{}' completed in {}ms - Status: {}", jobName, duration, status);

// Step level
log.info("Step '{}' starting", stepName);
log.info("Step '{}' completed - Read: {}, Written: {}, Skipped: {}",
    stepName, readCount, writeCount, skipCount);

// Item level
log.debug("Processing item: {}", item.getId());
log.warn("Skipping invalid item: {} - Reason: {}", item.getId(), reason);
log.error("Failed to process item: {}", item.getId(), exception);
```

---

## Testing Standards

### Test Class Structure

```java
@SpringBatchTest
@SpringBootTest
@ActiveProfiles("test")
class CustomerMigrationJobTest {

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Autowired
    private JobRepositoryTestUtils jobRepositoryTestUtils;

    @BeforeEach
    void setUp() {
        jobRepositoryTestUtils.removeJobExecutions();
    }

    @Test
    void shouldCompleteSuccessfully() throws Exception {
        // Given
        // ... setup test data

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob();

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
    }
}
```

### Test Data Management

```java
@Sql(scripts = "/test-data/setup.sql",
     executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts = "/test-data/cleanup.sql",
     executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
```

---

## Documentation Standards

### Job Documentation Header

```java
/**
 * Customer Migration Batch Job
 *
 * Purpose: Migrates customer data from legacy system to new format.
 *
 * Steps:
 * 1. Extract - Read from source database
 * 2. Transform - Apply business rules and validation
 * 3. Load - Write to target database
 *
 * Schedule: Daily at 2:00 AM
 * Expected Runtime: 30-60 minutes for ~1M records
 *
 * Parameters:
 * - processDate: Date to process (format: yyyy-MM-dd)
 * - dryRun: If true, don't commit changes
 *
 * @see CustomerMigrationBatchConfig
 */
```

### Architecture Decision Record (ADR)

```markdown
# ADR-001: Use JPA for Persistence

## Status
Accepted

## Context
Need to choose persistence layer for batch processing.

## Decision
Use JPA with Hibernate for database operations.

## Consequences
- Positive: Familiar to team, good tooling support
- Negative: May need optimization for large volumes
- Mitigation: Configure batch settings, use pagination
```

---

## Version Control

### Commit Message Format

```
[BATCH] Add customer migration job

- Implement extract step with JDBC cursor reader
- Add validation processor with skip policy
- Configure fault tolerance (skip 100, retry 3)

Closes #123
```

### Branch Naming

```
feature/batch-customer-migration
bugfix/batch-skip-policy-fix
refactor/batch-partitioning
```
