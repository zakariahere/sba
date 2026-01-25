# Testing Templates

**Purpose**: Test templates for Spring Batch jobs.

---

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{JobName}}` | Job class name | `CustomerMigration` |
| `{{jobName}}` | Job bean name | `customerMigrationJob` |
| `{{Input}}` | Input type | `CustomerInput` |
| `{{Output}}` | Output type | `CustomerOutput` |
| `{{package}}` | Base package | `com.company.batch` |

---

## Job Integration Test

```java
package {{package}}.integration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.batch.core.*;
import org.springframework.batch.test.JobLauncherTestUtils;
import org.springframework.batch.test.JobRepositoryTestUtils;
import org.springframework.batch.test.context.SpringBatchTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.*;

@SpringBatchTest
@SpringBootTest
@ActiveProfiles("test")
class {{JobName}}JobIntegrationTest {

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Autowired
    private JobRepositoryTestUtils jobRepositoryTestUtils;

    @BeforeEach
    void setUp() {
        jobRepositoryTestUtils.removeJobExecutions();
    }

    @Test
    void shouldCompleteJobSuccessfully() throws Exception {
        // Given
        JobParameters params = new JobParametersBuilder()
            .addString("processDate", "2024-01-01")
            .addLong("runId", System.currentTimeMillis())
            .toJobParameters();

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob(params);

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
        assertThat(execution.getExitStatus()).isEqualTo(ExitStatus.COMPLETED);
    }

    @Test
    void shouldProcessExpectedNumberOfRecords() throws Exception {
        // Given
        // ... set up test data ...

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob();

        // Then
        StepExecution stepExecution = execution.getStepExecutions()
            .iterator().next();

        assertThat(stepExecution.getReadCount()).isEqualTo(100);
        assertThat(stepExecution.getWriteCount()).isEqualTo(100);
        assertThat(stepExecution.getSkipCount()).isZero();
    }

    @Test
    void shouldHandleEmptyInput() throws Exception {
        // Given - no test data

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob();

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
        StepExecution stepExecution = execution.getStepExecutions()
            .iterator().next();
        assertThat(stepExecution.getReadCount()).isZero();
    }
}
```

---

## Step Test

```java
package {{package}}.integration;

import org.junit.jupiter.api.Test;
import org.springframework.batch.core.*;
import org.springframework.batch.test.JobLauncherTestUtils;
import org.springframework.batch.test.context.SpringBatchTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.*;

@SpringBatchTest
@SpringBootTest
class {{JobName}}StepTest {

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Test
    void shouldExecuteSingleStepSuccessfully() {
        // When
        JobExecution execution = jobLauncherTestUtils.launchStep("{{stepName}}");

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
    }

    @Test
    void shouldSkipInvalidRecords() {
        // Given
        // ... set up data with some invalid records ...

        // When
        JobExecution execution = jobLauncherTestUtils.launchStep("{{stepName}}");

        // Then
        StepExecution stepExecution = execution.getStepExecutions()
            .iterator().next();

        assertThat(stepExecution.getSkipCount()).isGreaterThan(0);
        assertThat(stepExecution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
    }
}
```

---

## Processor Unit Test

```java
package {{package}}.processor;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class {{Processor}}Test {

    @Mock
    private ExternalService externalService;

    private {{Processor}} processor;

    @BeforeEach
    void setUp() {
        processor = new {{Processor}}(externalService);
    }

    @Test
    void shouldTransformValidInput() throws Exception {
        // Given
        {{Input}} input = {{Input}}.builder()
            .id(1L)
            .field1("test")
            .field2("data")
            .build();

        // When
        {{Output}} output = processor.process(input);

        // Then
        assertThat(output).isNotNull();
        assertThat(output.getId()).isEqualTo(1L);
        assertThat(output.getField1()).isEqualTo("TEST");  // transformed
    }

    @Test
    void shouldReturnNullForInvalidInput() throws Exception {
        // Given
        {{Input}} invalidInput = {{Input}}.builder()
            .id(null)  // invalid
            .build();

        // When
        {{Output}} output = processor.process(invalidInput);

        // Then
        assertThat(output).isNull();  // skipped
    }

    @Test
    void shouldThrowExceptionOnProcessingError() {
        // Given
        {{Input}} input = {{Input}}.builder()
            .id(1L)
            .field1("error-trigger")
            .build();

        when(externalService.lookup(any()))
            .thenThrow(new RuntimeException("Service unavailable"));

        // When/Then
        assertThatThrownBy(() -> processor.process(input))
            .isInstanceOf(ProcessingException.class)
            .hasMessageContaining("Service unavailable");
    }
}
```

---

## Reader Test

```java
package {{package}}.reader;

import org.junit.jupiter.api.Test;
import org.springframework.batch.item.ExecutionContext;
import org.springframework.batch.item.database.JdbcPagingItemReader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.jdbc.Sql;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Sql(scripts = "/test-data.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(scripts = "/cleanup.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class {{Input}}ReaderTest {

    @Autowired
    private JdbcPagingItemReader<{{Input}}> reader;

    @Test
    void shouldReadAllRecords() throws Exception {
        // Given
        reader.open(new ExecutionContext());

        // When
        int count = 0;
        {{Input}} item;
        while ((item = reader.read()) != null) {
            count++;
            assertThat(item.getId()).isNotNull();
        }

        // Then
        assertThat(count).isEqualTo(10);  // Expected from test-data.sql

        reader.close();
    }

    @Test
    void shouldSupportRestart() throws Exception {
        // Given
        ExecutionContext context = new ExecutionContext();
        reader.open(context);

        // Read partial
        reader.read();
        reader.read();
        reader.update(context);
        reader.close();

        // When - restart
        reader.open(context);
        int remaining = 0;
        while (reader.read() != null) {
            remaining++;
        }

        // Then
        assertThat(remaining).isEqualTo(8);  // 10 - 2 already read
        reader.close();
    }
}
```

---

## Writer Test

```java
package {{package}}.writer;

import org.junit.jupiter.api.Test;
import org.springframework.batch.item.Chunk;
import org.springframework.batch.item.database.JdbcBatchItemWriter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.jdbc.Sql;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Sql(scripts = "/cleanup.sql", executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class {{Output}}WriterTest {

    @Autowired
    private JdbcBatchItemWriter<{{Output}}> writer;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void shouldWriteAllItems() throws Exception {
        // Given
        List<{{Output}}> items = List.of(
            {{Output}}.builder().id(1L).field1("test1").build(),
            {{Output}}.builder().id(2L).field1("test2").build(),
            {{Output}}.builder().id(3L).field1("test3").build()
        );

        // When
        writer.write(new Chunk<>(items));

        // Then
        int count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM {{tableName}}",
            Integer.class
        );
        assertThat(count).isEqualTo(3);
    }

    @Test
    void shouldUpsertExistingRecords() throws Exception {
        // Given - insert initial record
        jdbcTemplate.update(
            "INSERT INTO {{tableName}} (id, field1) VALUES (1, 'original')"
        );

        {{Output}} updated = {{Output}}.builder()
            .id(1L)
            .field1("updated")
            .build();

        // When
        writer.write(new Chunk<>(List.of(updated)));

        // Then
        String field1 = jdbcTemplate.queryForObject(
            "SELECT field1 FROM {{tableName}} WHERE id = 1",
            String.class
        );
        assertThat(field1).isEqualTo("updated");
    }
}
```

---

## Testcontainers Setup

```java
package {{package}}.config;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfig {

    @Bean
    @ServiceConnection
    public PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:15-alpine"))
            .withDatabaseName("batch_test")
            .withUsername("test")
            .withPassword("test")
            .withInitScript("schema.sql");
    }
}
```

---

## Test Configuration

```java
package {{package}}.config;

import org.springframework.batch.core.configuration.annotation.EnableBatchProcessing;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@EnableAutoConfiguration
@EnableBatchProcessing
@Import({
    TestcontainersConfig.class,
    {{JobName}}BatchConfig.class
})
public class BatchTestConfig {

    // Test-specific beans or overrides
}
```

---

## Test Data SQL

```sql
-- test-data.sql
INSERT INTO source_table (id, field1, field2, status, created_at)
VALUES
    (1, 'test1', 'data1', 'PENDING', NOW()),
    (2, 'test2', 'data2', 'PENDING', NOW()),
    (3, 'test3', 'data3', 'PENDING', NOW()),
    (4, 'test4', 'data4', 'PENDING', NOW()),
    (5, 'test5', 'data5', 'PENDING', NOW()),
    (6, 'test6', 'data6', 'PENDING', NOW()),
    (7, 'test7', 'data7', 'PENDING', NOW()),
    (8, 'test8', 'data8', 'PENDING', NOW()),
    (9, 'test9', 'data9', 'PENDING', NOW()),
    (10, 'test10', 'data10', 'PENDING', NOW());

-- cleanup.sql
DELETE FROM target_table;
DELETE FROM source_table;
```

---

## Application Test Properties

```yaml
# application-test.yml
spring:
  batch:
    job:
      enabled: false
    jdbc:
      initialize-schema: always

  datasource:
    url: jdbc:tc:postgresql:15:///batch_test
    driver-class-name: org.testcontainers.jdbc.ContainerDatabaseDriver

logging:
  level:
    org.springframework.batch: DEBUG
    {{package}}: DEBUG
```
