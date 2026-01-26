# Phase 4: Implementation

**Goal**: Generate production-ready code based on the design.

**Token Budget**: ~15k tokens (this file + templates loaded on-demand)

---

## Entry Checklist

- [ ] Phase 3 complete with detailed design
- [ ] Data models defined
- [ ] Step configurations ready
- [ ] Skills loaded for persistence and database

## Template Loading Strategy

**Load templates JUST-IN-TIME** - only when generating that artifact type:

```yaml
template_loading_order:
  1. job-config.md      # Always needed first
  2. reader-templates.md  # When implementing readers
  3. processor-templates.md  # When implementing processors
  4. writer-templates.md  # When implementing writers
  5. testing-templates.md  # After main code complete
```

**DO NOT** load all templates at once. Load → Generate → Unload → Next.

---

## Implementation Order

### Step 1: Project Structure

Create standard Spring Batch project structure:

```
src/main/java/{package}/
├── config/
│   └── {JobName}BatchConfig.java
├── entity/
│   ├── {Source}Entity.java (if JPA)
│   └── {Target}Entity.java (if JPA)
├── dto/
│   ├── {Source}Input.java
│   └── {Target}Output.java
├── reader/
│   └── {Custom}ItemReader.java (if custom)
├── processor/
│   └── {Name}ItemProcessor.java
├── writer/
│   └── {Custom}ItemWriter.java (if custom)
├── listener/
│   ├── JobCompletionListener.java
│   └── StepExecutionListener.java
├── mapper/
│   └── {Name}RowMapper.java (if JDBC/MyBatis)
└── validator/
    └── {Name}Validator.java (if needed)

src/main/resources/
├── application.yml
├── application-{profile}.yml
└── db/migration/ (if using Flyway)

src/test/java/{package}/
├── config/
│   └── {JobName}BatchConfigTest.java
├── processor/
│   └── {Name}ItemProcessorTest.java
└── integration/
    └── {JobName}IntegrationTest.java
```

### Step 2: Generate Configuration

**Load**: `{{AGENT_DIR}}/sba/templates/job-config.md`

Generate `{JobName}BatchConfig.java`:
- Job bean definition
- Step bean definitions
- Reader/Processor/Writer beans
- Listeners
- Transaction manager
- Job parameters

### Step 3: Generate Data Models

Based on design, generate:
- Input DTOs/Entities
- Output DTOs/Entities
- Row mappers (if JDBC/MyBatis)
- JPA entities with annotations (if JPA)

### Step 4: Generate Readers

**Load**: `{{AGENT_DIR}}/sba/templates/reader-templates.md`

Based on source type:
- `JdbcCursorItemReader` - For database cursors
- `JdbcPagingItemReader` - For paginated DB reads
- `JpaPagingItemReader` - For JPA with pagination
- `FlatFileItemReader` - For CSV/fixed-width files
- `JsonItemReader` - For JSON files
- `StaxEventItemReader` - For XML files
- Custom reader - For APIs/special cases

### Step 5: Generate Processors

**Load**: `{{AGENT_DIR}}/sba/templates/processor-templates.md`

Generate processor with:
- Input validation
- Transformation logic
- Business rules
- Filtering (return null to skip)
- Error handling

Consider `CompositeItemProcessor` for complex pipelines:
```java
@Bean
public CompositeItemProcessor<Input, Output> processor() {
    return new CompositeItemProcessorBuilder<Input, Output>()
        .delegates(
            validatingProcessor(),
            transformingProcessor(),
            enrichingProcessor()
        )
        .build();
}
```

### Step 6: Generate Writers

**Load**: `{{AGENT_DIR}}/sba/templates/writer-templates.md`

Based on target type:
- `JdbcBatchItemWriter` - For JDBC batch inserts
- `JpaItemWriter` - For JPA persistence
- `FlatFileItemWriter` - For file output
- `CompositeItemWriter` - For multiple targets
- Custom writer - For APIs/special cases

### Step 7: Generate Listeners

Generate standard listeners:

```java
// Job completion notification
@Component
public class JobCompletionListener implements JobExecutionListener {
    @Override
    public void afterJob(JobExecution jobExecution) {
        if (jobExecution.getStatus() == BatchStatus.COMPLETED) {
            log.info("Job completed successfully");
        } else if (jobExecution.getStatus() == BatchStatus.FAILED) {
            log.error("Job failed: {}", jobExecution.getAllFailureExceptions());
        }
    }
}

// Step monitoring
@Component
public class StepMonitorListener implements StepExecutionListener {
    @Override
    public void afterStep(StepExecution stepExecution) {
        log.info("Step {} - Read: {}, Written: {}, Skipped: {}",
            stepExecution.getStepName(),
            stepExecution.getReadCount(),
            stepExecution.getWriteCount(),
            stepExecution.getSkipCount());
    }
}
```

### Step 8: Generate Configuration Properties

Generate `application.yml`:
```yaml
spring:
  batch:
    job:
      enabled: false  # Disable auto-run
    jdbc:
      initialize-schema: always  # or never in prod

  datasource:
    url: ${DB_URL}
    username: ${DB_USER}
    password: ${DB_PASSWORD}

batch:
  {job-name}:
    chunk-size: ${CHUNK_SIZE:1000}
    # ... other properties from design
```

### Step 9: Generate Tests

**Load**: `{{AGENT_DIR}}/sba/templates/testing-templates.md`

Generate:
1. **Unit tests** for processors
2. **Integration tests** using `@SpringBatchTest`
3. **Test fixtures** for sample data

---

## Code Generation Checklist

For each generated file, ensure:

- [ ] Package declaration correct
- [ ] Imports complete (no wildcards)
- [ ] Class-level documentation
- [ ] Method-level documentation for complex logic
- [ ] Proper logging (SLF4J)
- [ ] No hardcoded values
- [ ] Exception handling appropriate
- [ ] Follows loaded skill patterns

## Artifact Tracking

Update state as files are generated:

```yaml
sba_state.artifacts:
  - path: "src/main/java/.../BatchConfig.java"
    type: config
    description: "Main job configuration"
  - path: "src/main/java/.../ItemProcessor.java"
    type: processor
    description: "Data transformation processor"
  # ... continue for all files
```

## Implementation Summary Template

```markdown
## Implementation Summary

### Generated Artifacts

| File | Type | Purpose |
|------|------|---------|
| `BatchConfig.java` | config | Job and step definitions |
| `...Processor.java` | processor | Transformation logic |
| ... | ... | ... |

### Configuration
- Chunk size: {n}
- Skip limit: {n}
- Retry limit: {n}

### Running the Job

```bash
# Command line
java -jar app.jar --spring.batch.job.name={jobName}

# With parameters
java -jar app.jar --spring.batch.job.name={jobName} date=2024-01-01
```

### Next Steps
Phase 5: Review will validate:
- Code quality
- Performance optimization
- Security review
- Documentation completeness
```

## Transition Criteria

**Ready for Phase 5 when:**
- [ ] All configuration generated
- [ ] All data models generated
- [ ] Reader(s) implemented
- [ ] Processor(s) implemented
- [ ] Writer(s) implemented
- [ ] Listeners implemented
- [ ] Properties configured
- [ ] Tests generated
- [ ] Code compiles (if verifiable)
- [ ] Artifacts tracked in state

## Transition Command

```
sba_state.current_phase = 5
sba_state.artifacts = [generated_files]
→ Read {{AGENT_DIR}}/sba/phases/5-review.md
```

---

**IMPORTANT**: Generate complete, production-ready code. No TODOs or placeholder implementations unless explicitly discussed with user.
