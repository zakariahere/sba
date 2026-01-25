# Tasklet Pattern Skill

**Purpose**: Tasklet-based step patterns for non-item-oriented processing.

---

## When to Use Tasklets

**Good fit**:
- File operations (move, copy, delete, archive)
- Database maintenance (truncate, vacuum, update stats)
- API calls (single operations, not per-item)
- Validation steps (pre/post processing checks)
- Cleanup operations
- Sending notifications
- Generating summary reports

**Avoid when**:
- Processing large datasets item-by-item (use chunks)
- Need skip/retry on individual items

---

## Basic Tasklet

```java
@Component
public class SimpleTasklet implements Tasklet {

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        // Do work
        performOperation();

        // Return FINISHED to end, CONTINUABLE to repeat
        return RepeatStatus.FINISHED;
    }

    private void performOperation() {
        // Business logic
    }
}
```

---

## Tasklet Step Configuration

```java
@Configuration
public class TaskletJobConfig {

    @Bean
    public Job taskletJob(JobRepository jobRepository,
                          Step cleanupStep,
                          Step processStep,
                          Step archiveStep) {
        return new JobBuilder("taskletJob", jobRepository)
            .start(cleanupStep)
            .next(processStep)
            .next(archiveStep)
            .build();
    }

    @Bean
    public Step cleanupStep(JobRepository jobRepository,
                            PlatformTransactionManager txManager,
                            CleanupTasklet cleanupTasklet) {
        return new StepBuilder("cleanupStep", jobRepository)
            .tasklet(cleanupTasklet, txManager)
            .build();
    }
}
```

---

## File Operation Tasklets

### File Move Tasklet

```java
@Component
@StepScope
public class FileMoveTasklet implements Tasklet {

    @Value("#{jobParameters['sourceFile']}")
    private String sourceFile;

    @Value("#{jobParameters['targetDir']}")
    private String targetDir;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        Path source = Path.of(sourceFile);
        Path target = Path.of(targetDir).resolve(source.getFileName());

        if (Files.exists(source)) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            log.info("Moved file from {} to {}", source, target);
            contribution.incrementWriteCount(1);
        } else {
            log.warn("Source file not found: {}", source);
        }

        return RepeatStatus.FINISHED;
    }
}
```

### File Cleanup Tasklet

```java
@Component
@StepScope
public class FileCleanupTasklet implements Tasklet {

    @Value("#{jobParameters['directory']}")
    private String directory;

    @Value("${batch.cleanup.days-to-keep:30}")
    private int daysToKeep;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        Path dir = Path.of(directory);
        Instant cutoff = Instant.now().minus(daysToKeep, ChronoUnit.DAYS);

        try (Stream<Path> files = Files.walk(dir)) {
            files.filter(Files::isRegularFile)
                .filter(path -> isOlderThan(path, cutoff))
                .forEach(path -> {
                    try {
                        Files.delete(path);
                        contribution.incrementWriteCount(1);
                        log.debug("Deleted: {}", path);
                    } catch (IOException e) {
                        log.error("Failed to delete: {}", path, e);
                    }
                });
        }

        return RepeatStatus.FINISHED;
    }

    private boolean isOlderThan(Path path, Instant cutoff) {
        try {
            return Files.getLastModifiedTime(path).toInstant().isBefore(cutoff);
        } catch (IOException e) {
            return false;
        }
    }
}
```

### Archive Tasklet

```java
@Component
@StepScope
public class ArchiveTasklet implements Tasklet {

    @Value("#{jobParameters['sourceDir']}")
    private String sourceDir;

    @Value("#{jobParameters['archivePath']}")
    private String archivePath;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        Path source = Path.of(sourceDir);
        Path archive = Path.of(archivePath);

        try (ZipOutputStream zos = new ZipOutputStream(
                new FileOutputStream(archive.toFile()));
             Stream<Path> files = Files.walk(source)) {

            files.filter(Files::isRegularFile)
                .forEach(path -> {
                    try {
                        ZipEntry entry = new ZipEntry(
                            source.relativize(path).toString());
                        zos.putNextEntry(entry);
                        Files.copy(path, zos);
                        zos.closeEntry();
                        contribution.incrementReadCount(1);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });
        }

        log.info("Archived {} files to {}", contribution.getReadCount(), archive);
        return RepeatStatus.FINISHED;
    }
}
```

---

## Database Maintenance Tasklets

### Truncate Table Tasklet

```java
@Component
public class TruncateTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;
    private final String tableName;

    public TruncateTasklet(JdbcTemplate jdbcTemplate,
                           @Value("${batch.truncate.table}") String tableName) {
        this.jdbcTemplate = jdbcTemplate;
        this.tableName = tableName;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        log.info("Truncating table: {}", tableName);
        jdbcTemplate.execute("TRUNCATE TABLE " + tableName);
        return RepeatStatus.FINISHED;
    }
}
```

### Statistics Update Tasklet

```java
@Component
public class AnalyzeTableTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;
    private final List<String> tables;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        for (String table : tables) {
            log.info("Analyzing table: {}", table);
            // PostgreSQL
            jdbcTemplate.execute("ANALYZE " + table);
            // Oracle: jdbcTemplate.execute("ANALYZE TABLE " + table + " COMPUTE STATISTICS");
            contribution.incrementWriteCount(1);
        }

        return RepeatStatus.FINISHED;
    }
}
```

### Bulk Update Tasklet

```java
@Component
@StepScope
public class StatusUpdateTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;

    @Value("#{jobParameters['jobExecutionId']}")
    private Long jobExecutionId;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        int updated = jdbcTemplate.update("""
            UPDATE processed_records
            SET status = 'ARCHIVED',
                archived_at = NOW()
            WHERE job_execution_id = ?
              AND status = 'COMPLETED'
            """, jobExecutionId);

        contribution.incrementWriteCount(updated);
        log.info("Updated {} records to ARCHIVED status", updated);

        return RepeatStatus.FINISHED;
    }
}
```

---

## Validation Tasklets

### Pre-Processing Validation

```java
@Component
@StepScope
public class ValidationTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;

    @Value("#{jobParameters['processDate']}")
    private String processDate;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        // Check if data exists for processing
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM source_table WHERE process_date = ? AND status = 'PENDING'",
            Integer.class,
            processDate
        );

        if (count == null || count == 0) {
            log.warn("No data found for date: {}", processDate);
            contribution.setExitStatus(new ExitStatus("NO_DATA"));
            return RepeatStatus.FINISHED;
        }

        // Validate data quality
        Integer invalidCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM source_table WHERE process_date = ? AND field1 IS NULL",
            Integer.class,
            processDate
        );

        if (invalidCount > count * 0.1) {  // More than 10% invalid
            throw new ValidationException("Too many invalid records: " + invalidCount);
        }

        log.info("Validation passed. {} records ready for processing", count);
        contribution.setExitStatus(new ExitStatus("VALID"));

        return RepeatStatus.FINISHED;
    }
}
```

### Post-Processing Validation

```java
@Component
public class ReconciliationTasklet implements Tasklet {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        Long sourceCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM source_table WHERE status = 'PROCESSED'",
            Long.class
        );

        Long targetCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM target_table",
            Long.class
        );

        if (!sourceCount.equals(targetCount)) {
            throw new ReconciliationException(
                String.format("Count mismatch: source=%d, target=%d",
                    sourceCount, targetCount));
        }

        log.info("Reconciliation passed. {} records match", sourceCount);
        return RepeatStatus.FINISHED;
    }
}
```

---

## Notification Tasklets

### Email Notification Tasklet

```java
@Component
@StepScope
public class EmailNotificationTasklet implements Tasklet {

    private final JavaMailSender mailSender;

    @Value("${batch.notification.recipients}")
    private String[] recipients;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        StepExecution stepExecution = chunkContext.getStepContext().getStepExecution();
        JobExecution jobExecution = stepExecution.getJobExecution();

        String subject = String.format("Batch Job %s - %s",
            jobExecution.getJobInstance().getJobName(),
            jobExecution.getStatus());

        String body = buildEmailBody(jobExecution);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipients);
        message.setSubject(subject);
        message.setText(body);

        mailSender.send(message);
        log.info("Notification email sent to {} recipients", recipients.length);

        return RepeatStatus.FINISHED;
    }

    private String buildEmailBody(JobExecution execution) {
        StringBuilder sb = new StringBuilder();
        sb.append("Job: ").append(execution.getJobInstance().getJobName()).append("\n");
        sb.append("Status: ").append(execution.getStatus()).append("\n");
        sb.append("Start Time: ").append(execution.getStartTime()).append("\n");
        sb.append("End Time: ").append(execution.getEndTime()).append("\n\n");

        sb.append("Step Summary:\n");
        for (StepExecution step : execution.getStepExecutions()) {
            sb.append(String.format("  %s: Read=%d, Written=%d, Skipped=%d\n",
                step.getStepName(),
                step.getReadCount(),
                step.getWriteCount(),
                step.getSkipCount()));
        }

        return sb.toString();
    }
}
```

---

## API Integration Tasklets

### API Call Tasklet

```java
@Component
@StepScope
public class ApiNotificationTasklet implements Tasklet {

    private final RestTemplate restTemplate;

    @Value("${api.notification.url}")
    private String apiUrl;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        JobExecution jobExecution = chunkContext.getStepContext()
            .getStepExecution().getJobExecution();

        NotificationPayload payload = NotificationPayload.builder()
            .jobName(jobExecution.getJobInstance().getJobName())
            .status(jobExecution.getStatus().name())
            .completedAt(LocalDateTime.now())
            .build();

        try {
            ResponseEntity<Void> response = restTemplate.postForEntity(
                apiUrl, payload, Void.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("API notification sent successfully");
            } else {
                log.warn("API notification returned: {}", response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("Failed to send API notification", e);
            // Don't fail the job for notification failure
        }

        return RepeatStatus.FINISHED;
    }
}
```

---

## Conditional Tasklets

### Tasklet with Exit Status

```java
@Component
@StepScope
public class ConditionalTasklet implements Tasklet {

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {

        boolean dataExists = checkForData();

        if (dataExists) {
            contribution.setExitStatus(new ExitStatus("DATA_FOUND"));
        } else {
            contribution.setExitStatus(new ExitStatus("NO_DATA"));
        }

        return RepeatStatus.FINISHED;
    }
}
```

### Job Flow with Conditional

```java
@Bean
public Job conditionalJob(JobRepository jobRepository,
                          Step checkStep,
                          Step processStep,
                          Step skipStep) {
    return new JobBuilder("conditionalJob", jobRepository)
        .start(checkStep)
            .on("DATA_FOUND").to(processStep)
        .from(checkStep)
            .on("NO_DATA").to(skipStep)
        .end()
        .build();
}
```

---

## Repeating Tasklet

```java
@Component
public class PollingTasklet implements Tasklet {

    private final ApiClient apiClient;
    private int maxAttempts = 10;
    private int attemptCount = 0;

    @Override
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) throws Exception {

        attemptCount++;

        ApiStatus status = apiClient.checkStatus();

        if (status == ApiStatus.COMPLETE) {
            log.info("API processing complete after {} attempts", attemptCount);
            return RepeatStatus.FINISHED;
        }

        if (attemptCount >= maxAttempts) {
            throw new TimeoutException("API did not complete within " + maxAttempts + " attempts");
        }

        log.info("Attempt {}/{}: Status = {}, waiting...", attemptCount, maxAttempts, status);
        Thread.sleep(5000);  // Wait 5 seconds

        return RepeatStatus.CONTINUABLE;  // Repeat the tasklet
    }
}
```

---

## Transaction Configuration

### Tasklet without Transaction

```java
@Bean
public Step noTxStep(JobRepository jobRepository) {
    return new StepBuilder("noTxStep", jobRepository)
        .tasklet((contribution, chunkContext) -> {
            // File operations don't need DB transaction
            Files.copy(source, target);
            return RepeatStatus.FINISHED;
        }, new ResourcelessTransactionManager())  // No-op transaction manager
        .build();
}
```

---

## Best Practices

1. **Single Responsibility**: One tasklet = one operation
2. **Idempotent**: Safe to re-run on restart
3. **Exit Status**: Use custom exit status for flow control
4. **Logging**: Clear logging of what was done
5. **Error Handling**: Decide fail vs continue on errors
