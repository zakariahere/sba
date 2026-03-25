# Job Configuration Templates

**Purpose**: Reusable templates for Spring Batch job configurations.

---

## Variables

Replace these placeholders when generating:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{JobName}}` | Job class name (PascalCase) | `CustomerDataMigration` |
| `{{jobName}}` | Job bean name (camelCase) | `customerDataMigrationJob` |
| `{{StepName}}` | Step class name | `ProcessCustomers` |
| `{{stepName}}` | Step bean name | `processCustomersStep` |
| `{{Input}}` | Input type | `CustomerInput` |
| `{{Output}}` | Output type | `CustomerOutput` |
| `{{package}}` | Base package | `com.company.batch` |
| `{{chunkSize}}` | Chunk size | `1000` |

---

## Basic Job Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class {{JobName}}BatchConfig {

    @Bean
    public Job {{jobName}}Job(JobRepository jobRepository,
                              Step {{stepName}}Step,
                              JobCompletionListener listener) {
        return new JobBuilder("{{jobName}}", jobRepository)
            .listener(listener)
            .start({{stepName}}Step)
            .build();
    }

    @Bean
    public Step {{stepName}}Step(JobRepository jobRepository,
                                 PlatformTransactionManager transactionManager,
                                 ItemReader<{{Input}}> reader,
                                 ItemProcessor<{{Input}}, {{Output}}> processor,
                                 ItemWriter<{{Output}}> writer) {
        return new StepBuilder("{{stepName}}", jobRepository)
            .<{{Input}}, {{Output}}>chunk({{chunkSize}}, transactionManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
    }
}
```

---

## Multi-Step Job Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class {{JobName}}BatchConfig {

    @Bean
    public Job {{jobName}}Job(JobRepository jobRepository,
                              Step extractStep,
                              Step transformStep,
                              Step loadStep,
                              JobCompletionListener listener) {
        return new JobBuilder("{{jobName}}", jobRepository)
            .listener(listener)
            .start(extractStep)
            .next(transformStep)
            .next(loadStep)
            .build();
    }

    // Define each step bean...
}
```

---

## Conditional Flow Job

```java
package {{package}}.config;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.job.flow.FlowExecutionStatus;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class {{JobName}}BatchConfig {

    @Bean
    public Job {{jobName}}Job(JobRepository jobRepository,
                              Step validationStep,
                              Step processStep,
                              Step errorStep,
                              Step cleanupStep) {
        return new JobBuilder("{{jobName}}", jobRepository)
            .start(validationStep)
                .on("VALID").to(processStep)
                .from(validationStep)
                .on("INVALID").to(errorStep)
            .from(processStep)
                .on("*").to(cleanupStep)
            .from(errorStep)
                .on("*").to(cleanupStep)
            .end()
            .build();
    }

    @Bean
    public Step validationStep(JobRepository jobRepository,
                               PlatformTransactionManager txManager) {
        return new StepBuilder("validation", jobRepository)
            .tasklet((contribution, chunkContext) -> {
                boolean isValid = performValidation();
                if (isValid) {
                    contribution.setExitStatus(new ExitStatus("VALID"));
                } else {
                    contribution.setExitStatus(new ExitStatus("INVALID"));
                }
                return RepeatStatus.FINISHED;
            }, txManager)
            .build();
    }
}
```

---

## Partitioned Job Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.partition.support.Partitioner;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class {{JobName}}PartitionedConfig {

    @Bean
    public Job {{jobName}}Job(JobRepository jobRepository,
                              Step partitionedStep) {
        return new JobBuilder("{{jobName}}", jobRepository)
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
            .taskExecutor(taskExecutor)
            .gridSize({{gridSize}})
            .build();
    }

    @Bean
    @StepScope
    public Step workerStep(JobRepository jobRepository,
                           PlatformTransactionManager txManager,
                           @Value("#{stepExecutionContext['minId']}") Long minId,
                           @Value("#{stepExecutionContext['maxId']}") Long maxId) {
        return new StepBuilder("workerStep", jobRepository)
            .<{{Input}}, {{Output}}>chunk({{chunkSize}}, txManager)
            .reader(partitionedReader(minId, maxId))
            .processor(processor())
            .writer(writer())
            .build();
    }

    @Bean
    public Partitioner partitioner(DataSource dataSource) {
        return new RangePartitioner(dataSource);
    }

    @Bean
    public TaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(25);
        executor.setThreadNamePrefix("batch-worker-");
        executor.initialize();
        return executor;
    }
}
```

---

## Fault Tolerant Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.Step;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class {{JobName}}FaultTolerantConfig {

    @Bean
    public Step faultTolerantStep(JobRepository jobRepository,
                                  PlatformTransactionManager txManager) {
        return new StepBuilder("faultTolerantStep", jobRepository)
            .<{{Input}}, {{Output}}>chunk({{chunkSize}}, txManager)
            .reader(reader())
            .processor(processor())
            .writer(writer())
            .faultTolerant()
            // Skip configuration
            .skipLimit({{skipLimit}})
            .skip(ValidationException.class)
            .skip(DataIntegrityViolationException.class)
            // Retry configuration
            .retryLimit({{retryLimit}})
            .retry(DeadlockLoserDataAccessException.class)
            .retry(TransientDataAccessException.class)
            .backOffPolicy(new ExponentialBackOffPolicy())
            // Listeners
            .listener(skipListener())
            .listener(retryListener())
            .build();
    }
}
```

---

## Job Launcher Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.Job;
import org.springframework.batch.core.JobParameters;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class {{JobName}}Scheduler {

    private final JobLauncher jobLauncher;
    private final Job {{jobName}}Job;

    public {{JobName}}Scheduler(JobLauncher jobLauncher,
                                @Qualifier("{{jobName}}Job") Job job) {
        this.jobLauncher = jobLauncher;
        this.{{jobName}}Job = job;
    }

    @Scheduled(cron = "${batch.{{jobName}}.cron:0 0 2 * * ?}")
    public void runJob() throws Exception {
        JobParameters params = new JobParametersBuilder()
            .addLocalDateTime("runTime", LocalDateTime.now())
            .toJobParameters();

        jobLauncher.run({{jobName}}Job, params);
    }
}
```

---

## Job Completion Listener

```java
package {{package}}.listener;

import org.springframework.batch.core.BatchStatus;
import org.springframework.batch.core.JobExecution;
import org.springframework.batch.core.JobExecutionListener;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class JobCompletionListener implements JobExecutionListener {

    @Override
    public void beforeJob(JobExecution jobExecution) {
        log.info("Job {} starting with parameters: {}",
            jobExecution.getJobInstance().getJobName(),
            jobExecution.getJobParameters());
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        if (jobExecution.getStatus() == BatchStatus.COMPLETED) {
            log.info("Job {} completed successfully in {}ms",
                jobExecution.getJobInstance().getJobName(),
                jobExecution.getEndTime().toEpochMilli() -
                jobExecution.getStartTime().toEpochMilli());

            logStepSummaries(jobExecution);
        } else if (jobExecution.getStatus() == BatchStatus.FAILED) {
            log.error("Job {} failed with exceptions: {}",
                jobExecution.getJobInstance().getJobName(),
                jobExecution.getAllFailureExceptions());
        }
    }

    private void logStepSummaries(JobExecution jobExecution) {
        jobExecution.getStepExecutions().forEach(step -> {
            log.info("Step: {} | Read: {} | Written: {} | Skipped: {}",
                step.getStepName(),
                step.getReadCount(),
                step.getWriteCount(),
                step.getSkipCount());
        });
    }
}
```

---

## Application Properties

```yaml
spring:
  batch:
    job:
      enabled: false  # Disable auto-run on startup
    jdbc:
      initialize-schema: always  # or 'never' in production

  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/batch_db}
    username: ${DB_USER:batch_user}
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: ${DB_POOL_SIZE:10}

batch:
  {{jobName}}:
    chunk-size: ${CHUNK_SIZE:{{chunkSize}}}
    skip-limit: ${SKIP_LIMIT:{{skipLimit}}}
    retry-limit: ${RETRY_LIMIT:{{retryLimit}}}
    cron: ${BATCH_CRON:0 0 2 * * ?}

logging:
  level:
    org.springframework.batch: INFO
    {{package}}: DEBUG
```
