# Writer Templates

**Purpose**: ItemWriter implementations for various data targets.

---

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{Output}}` | Output type | `CustomerOutput` |
| `{{tableName}}` | Database table name | `customers` |
| `{{package}}` | Base package | `com.company.batch` |

---

## JDBC Batch Writer

Best for: High-performance database writes.

```java
package {{package}}.writer;

import org.springframework.batch.item.database.JdbcBatchItemWriter;
import org.springframework.batch.item.database.builder.JdbcBatchItemWriterBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import javax.sql.DataSource;

@Configuration
public class {{Output}}WriterConfig {

    @Bean
    public JdbcBatchItemWriter<{{Output}}> {{output}}Writer(DataSource dataSource) {
        return new JdbcBatchItemWriterBuilder<{{Output}}>()
            .dataSource(dataSource)
            .sql("""
                INSERT INTO {{tableName}} (id, field1, field2, created_at)
                VALUES (:id, :field1, :field2, :createdAt)
                """)
            .beanMapped()
            .build();
    }
}
```

---

## JDBC Upsert Writer (PostgreSQL)

```java
package {{package}}.writer;

import org.springframework.batch.item.database.JdbcBatchItemWriter;
import org.springframework.batch.item.database.builder.JdbcBatchItemWriterBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import javax.sql.DataSource;

@Configuration
public class {{Output}}UpsertWriterConfig {

    @Bean
    public JdbcBatchItemWriter<{{Output}}> {{output}}UpsertWriter(DataSource dataSource) {
        return new JdbcBatchItemWriterBuilder<{{Output}}>()
            .dataSource(dataSource)
            .sql("""
                INSERT INTO {{tableName}} (id, field1, field2, updated_at)
                VALUES (:id, :field1, :field2, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    field1 = EXCLUDED.field1,
                    field2 = EXCLUDED.field2,
                    updated_at = NOW()
                """)
            .beanMapped()
            .build();
    }
}
```

---

## JPA Item Writer

Best for: JPA-based applications with entities.

```java
package {{package}}.writer;

import org.springframework.batch.item.database.JpaItemWriter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import jakarta.persistence.EntityManagerFactory;

@Configuration
public class {{Output}}JpaWriterConfig {

    @Bean
    public JpaItemWriter<{{Output}}> {{output}}JpaWriter(
            EntityManagerFactory entityManagerFactory) {

        JpaItemWriter<{{Output}}> writer = new JpaItemWriter<>();
        writer.setEntityManagerFactory(entityManagerFactory);
        writer.setClearPersistenceContext(true);  // Prevent memory issues
        return writer;
    }
}
```

---

## Flat File Writer (CSV)

Best for: CSV file output.

```java
package {{package}}.writer;

import org.springframework.batch.item.file.FlatFileItemWriter;
import org.springframework.batch.item.file.builder.FlatFileItemWriterBuilder;
import org.springframework.batch.item.file.transform.BeanWrapperFieldExtractor;
import org.springframework.batch.item.file.transform.DelimitedLineAggregator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.core.io.FileSystemResource;

@Configuration
public class {{Output}}FileWriterConfig {

    @Bean
    @StepScope
    public FlatFileItemWriter<{{Output}}> {{output}}FileWriter(
            @Value("#{jobParameters['outputFile']}") String outputFile) {

        BeanWrapperFieldExtractor<{{Output}}> extractor = new BeanWrapperFieldExtractor<>();
        extractor.setNames(new String[]{"id", "field1", "field2", "createdAt"});

        DelimitedLineAggregator<{{Output}}> aggregator = new DelimitedLineAggregator<>();
        aggregator.setDelimiter(",");
        aggregator.setFieldExtractor(extractor);

        return new FlatFileItemWriterBuilder<{{Output}}>()
            .name("{{output}}FileWriter")
            .resource(new FileSystemResource(outputFile))
            .headerCallback(writer -> writer.write("id,field1,field2,createdAt"))
            .lineAggregator(aggregator)
            .build();
    }
}
```

---

## JSON File Writer

Best for: JSON file output.

```java
package {{package}}.writer;

import org.springframework.batch.item.json.JacksonJsonObjectMarshaller;
import org.springframework.batch.item.json.JsonFileItemWriter;
import org.springframework.batch.item.json.builder.JsonFileItemWriterBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.core.io.FileSystemResource;

@Configuration
public class {{Output}}JsonWriterConfig {

    @Bean
    @StepScope
    public JsonFileItemWriter<{{Output}}> {{output}}JsonWriter(
            @Value("#{jobParameters['outputFile']}") String outputFile) {

        return new JsonFileItemWriterBuilder<{{Output}}>()
            .name("{{output}}JsonWriter")
            .resource(new FileSystemResource(outputFile))
            .jsonObjectMarshaller(new JacksonJsonObjectMarshaller<>())
            .build();
    }
}
```

---

## Composite Writer (Multiple Targets)

```java
package {{package}}.writer;

import org.springframework.batch.item.support.CompositeItemWriter;
import org.springframework.batch.item.support.builder.CompositeItemWriterBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class Composite{{Output}}WriterConfig {

    @Bean
    public CompositeItemWriter<{{Output}}> composite{{Output}}Writer(
            JdbcBatchItemWriter<{{Output}}> databaseWriter,
            FlatFileItemWriter<{{Output}}> fileWriter,
            JdbcBatchItemWriter<AuditRecord> auditWriter) {

        return new CompositeItemWriterBuilder<{{Output}}>()
            .delegates(List.of(
                databaseWriter,
                fileWriter,
                new AuditWrappingWriter(auditWriter)
            ))
            .build();
    }
}
```

---

## Classifier Writer (Route by Type)

```java
package {{package}}.writer;

import org.springframework.batch.item.support.ClassifierCompositeItemWriter;
import org.springframework.classify.Classifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class Classifier{{Output}}WriterConfig {

    @Bean
    public ClassifierCompositeItemWriter<{{Output}}> classifier{{Output}}Writer(
            JdbcBatchItemWriter<{{Output}}> successWriter,
            JdbcBatchItemWriter<{{Output}}> errorWriter) {

        ClassifierCompositeItemWriter<{{Output}}> writer =
            new ClassifierCompositeItemWriter<>();

        writer.setClassifier(
            (Classifier<{{Output}}, ItemWriter<? super {{Output}}>>) item -> {
                return item.isValid() ? successWriter : errorWriter;
            }
        );

        return writer;
    }
}
```

---

## Custom API Writer

Best for: Writing to REST APIs.

```java
package {{package}}.writer;

import org.springframework.batch.item.Chunk;
import org.springframework.batch.item.ItemWriter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class {{Output}}ApiWriter implements ItemWriter<{{Output}}> {

    private final RestTemplate restTemplate;
    private final String apiEndpoint;

    public {{Output}}ApiWriter(RestTemplate restTemplate,
                                @Value("${api.endpoint}") String apiEndpoint) {
        this.restTemplate = restTemplate;
        this.apiEndpoint = apiEndpoint;
    }

    @Override
    public void write(Chunk<? extends {{Output}}> chunk) throws Exception {
        List<{{Output}}> items = new ArrayList<>(chunk.getItems());

        // Batch API call
        try {
            ApiResponse response = restTemplate.postForObject(
                apiEndpoint + "/batch",
                new BatchRequest(items),
                ApiResponse.class
            );

            if (!response.isSuccess()) {
                throw new ApiWriteException("API batch write failed: " + response.getMessage());
            }

            log.info("Successfully wrote {} items to API", items.size());
        } catch (Exception e) {
            log.error("API write failed for {} items", items.size(), e);
            throw e;
        }
    }
}
```

---

## Message Queue Writer

Best for: Publishing to message queues.

```java
package {{package}}.writer;

import org.springframework.batch.item.Chunk;
import org.springframework.batch.item.ItemWriter;
import org.springframework.jms.core.JmsTemplate;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class {{Output}}JmsWriter implements ItemWriter<{{Output}}> {

    private final JmsTemplate jmsTemplate;
    private final String destinationQueue;

    @Override
    public void write(Chunk<? extends {{Output}}> chunk) throws Exception {
        for ({{Output}} item : chunk) {
            jmsTemplate.convertAndSend(destinationQueue, item);
        }
        log.debug("Published {} messages to queue", chunk.size());
    }
}
```

---

## Writer with Pre/Post Processing

```java
package {{package}}.writer;

import org.springframework.batch.item.Chunk;
import org.springframework.batch.item.ItemWriter;
import org.springframework.batch.item.database.JdbcBatchItemWriter;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class {{Output}}WriterWithHooks implements ItemWriter<{{Output}}> {

    private final JdbcBatchItemWriter<{{Output}}> delegate;
    private final NotificationService notificationService;

    @Override
    public void write(Chunk<? extends {{Output}}> chunk) throws Exception {
        // Pre-write validation
        validateChunk(chunk);

        // Actual write
        delegate.write(chunk);

        // Post-write actions
        postWrite(chunk);
    }

    private void validateChunk(Chunk<? extends {{Output}}> chunk) {
        for ({{Output}} item : chunk) {
            if (item.getId() == null) {
                throw new IllegalStateException("Item must have an ID before writing");
            }
        }
    }

    private void postWrite(Chunk<? extends {{Output}}> chunk) {
        // Notify external system
        notificationService.notifyWriteComplete(chunk.size());

        // Log summary
        log.info("Successfully wrote {} items", chunk.size());
    }
}
```

---

## Writer Listener

```java
package {{package}}.listener;

import org.springframework.batch.core.ItemWriteListener;
import org.springframework.batch.item.Chunk;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class {{Output}}WriteListener implements ItemWriteListener<{{Output}}> {

    @Override
    public void beforeWrite(Chunk<? extends {{Output}}> items) {
        log.debug("About to write {} items", items.size());
    }

    @Override
    public void afterWrite(Chunk<? extends {{Output}}> items) {
        log.info("Successfully wrote {} items", items.size());
    }

    @Override
    public void onWriteError(Exception exception, Chunk<? extends {{Output}}> items) {
        log.error("Error writing {} items: {}",
            items.size(),
            exception.getMessage());

        // Log failed item IDs for investigation
        items.getItems().forEach(item ->
            log.error("Failed item ID: {}", item.getId())
        );
    }
}
```

---

## No-Op Writer (Testing/Dry Run)

```java
package {{package}}.writer;

import org.springframework.batch.item.Chunk;
import org.springframework.batch.item.ItemWriter;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class NoOp{{Output}}Writer implements ItemWriter<{{Output}}> {

    @Override
    public void write(Chunk<? extends {{Output}}> chunk) {
        // Don't actually write, just log
        log.info("DRY RUN: Would write {} items", chunk.size());
        chunk.getItems().forEach(item ->
            log.debug("DRY RUN item: {}", item)
        );
    }
}
```
