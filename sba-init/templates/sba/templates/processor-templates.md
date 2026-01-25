# Processor Templates

**Purpose**: ItemProcessor implementations for data transformation.

---

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{Input}}` | Input type | `CustomerInput` |
| `{{Output}}` | Output type | `CustomerOutput` |
| `{{Processor}}` | Processor class name | `CustomerProcessor` |
| `{{package}}` | Base package | `com.company.batch` |

---

## Simple Transformation Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class {{Processor}} implements ItemProcessor<{{Input}}, {{Output}}> {

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        log.debug("Processing item: {}", item.getId());

        return {{Output}}.builder()
            .id(item.getId())
            .transformedField(transform(item.getField()))
            .processedAt(LocalDateTime.now())
            .build();
    }

    private String transform(String input) {
        // Transformation logic
        return input.trim().toUpperCase();
    }
}
```

---

## Validating Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import jakarta.validation.Validator;
import jakarta.validation.ConstraintViolation;
import java.util.Set;

@Slf4j
@Component
public class Validating{{Processor}} implements ItemProcessor<{{Input}}, {{Output}}> {

    private final Validator validator;

    public Validating{{Processor}}(Validator validator) {
        this.validator = validator;
    }

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        // Validate input
        Set<ConstraintViolation<{{Input}}>> violations = validator.validate(item);

        if (!violations.isEmpty()) {
            log.warn("Validation failed for item {}: {}",
                item.getId(),
                violations.stream()
                    .map(ConstraintViolation::getMessage)
                    .collect(Collectors.joining(", ")));
            return null;  // Skip invalid items
        }

        // Transform valid items
        return {{Output}}.builder()
            .id(item.getId())
            .field(item.getField())
            .build();
    }
}
```

---

## Filtering Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class Filtering{{Processor}} implements ItemProcessor<{{Input}}, {{Output}}> {

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        // Filter out items that don't meet criteria
        if (!shouldProcess(item)) {
            log.debug("Filtering out item: {}", item.getId());
            return null;  // Returning null skips the item
        }

        return convertToOutput(item);
    }

    private boolean shouldProcess({{Input}} item) {
        // Filter criteria
        return item.getStatus() == Status.ACTIVE
            && item.getAmount() > 0
            && item.getCreatedAt().isAfter(LocalDate.now().minusDays(30));
    }

    private {{Output}} convertToOutput({{Input}} item) {
        return {{Output}}.builder()
            .id(item.getId())
            .field(item.getField())
            .build();
    }
}
```

---

## Enrichment Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class Enriching{{Processor}} implements ItemProcessor<{{Input}}, {{Output}}> {

    private final ExternalService externalService;
    private final ReferenceDataCache cache;

    public Enriching{{Processor}}(ExternalService externalService,
                                   ReferenceDataCache cache) {
        this.externalService = externalService;
        this.cache = cache;
    }

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        // Enrich with cached reference data
        ReferenceData refData = cache.getById(item.getReferenceId());

        // Enrich with external service call (use sparingly)
        AdditionalInfo additionalInfo = externalService.lookup(item.getExternalId());

        return {{Output}}.builder()
            .id(item.getId())
            .field(item.getField())
            // Enriched fields
            .referenceName(refData.getName())
            .externalData(additionalInfo.getData())
            .enrichedAt(LocalDateTime.now())
            .build();
    }
}
```

---

## Composite Processor

```java
package {{package}}.config;

import org.springframework.batch.item.support.CompositeItemProcessor;
import org.springframework.batch.item.support.builder.CompositeItemProcessorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CompositeProcessorConfig {

    @Bean
    public CompositeItemProcessor<{{Input}}, {{Output}}> compositeProcessor(
            ValidationProcessor validationProcessor,
            TransformationProcessor transformationProcessor,
            EnrichmentProcessor enrichmentProcessor) {

        return new CompositeItemProcessorBuilder<{{Input}}, {{Output}}>()
            .delegates(List.of(
                validationProcessor,      // {{Input}} -> {{Input}} (or null)
                transformationProcessor,  // {{Input}} -> {{Intermediate}}
                enrichmentProcessor       // {{Intermediate}} -> {{Output}}
            ))
            .build();
    }
}
```

---

## Classifier Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.classify.Classifier;
import org.springframework.batch.item.support.ClassifierCompositeItemProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClassifierProcessorConfig {

    @Bean
    public ClassifierCompositeItemProcessor<{{Input}}, {{Output}}> classifierProcessor(
            TypeAProcessor typeAProcessor,
            TypeBProcessor typeBProcessor,
            DefaultProcessor defaultProcessor) {

        ClassifierCompositeItemProcessor<{{Input}}, {{Output}}> processor =
            new ClassifierCompositeItemProcessor<>();

        processor.setClassifier(
            (Classifier<{{Input}}, ItemProcessor<?, ? extends {{Output}}>>) item -> {
                return switch (item.getType()) {
                    case "TYPE_A" -> typeAProcessor;
                    case "TYPE_B" -> typeBProcessor;
                    default -> defaultProcessor;
                };
            }
        );

        return processor;
    }
}
```

---

## Async Processor Wrapper

```java
package {{package}}.config;

import org.springframework.batch.integration.async.AsyncItemProcessor;
import org.springframework.batch.integration.async.AsyncItemWriter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AsyncProcessorConfig {

    @Bean
    public AsyncItemProcessor<{{Input}}, {{Output}}> asyncProcessor(
            ItemProcessor<{{Input}}, {{Output}}> delegate,
            TaskExecutor taskExecutor) {

        AsyncItemProcessor<{{Input}}, {{Output}}> processor = new AsyncItemProcessor<>();
        processor.setDelegate(delegate);
        processor.setTaskExecutor(taskExecutor);
        return processor;
    }

    @Bean
    public AsyncItemWriter<{{Output}}> asyncWriter(
            ItemWriter<{{Output}}> delegate) {

        AsyncItemWriter<{{Output}}> writer = new AsyncItemWriter<>();
        writer.setDelegate(delegate);
        return writer;
    }

    @Bean
    public TaskExecutor processorTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("async-processor-");
        executor.initialize();
        return executor;
    }
}
```

---

## Pass-Through Processor

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;

@Component
public class PassThroughProcessor implements ItemProcessor<{{Input}}, {{Input}}> {

    @Override
    public {{Input}} process({{Input}} item) {
        // No transformation, just pass through
        return item;
    }
}
```

---

## Processor with State (Step Scoped)

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.batch.item.ExecutionContext;
import org.springframework.batch.core.StepExecution;
import org.springframework.batch.core.annotation.BeforeStep;
import org.springframework.batch.core.annotation.AfterStep;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.stereotype.Component;
import java.util.concurrent.atomic.AtomicLong;

@Component
@StepScope
public class Stateful{{Processor}} implements ItemProcessor<{{Input}}, {{Output}}> {

    private final AtomicLong processedCount = new AtomicLong(0);
    private final AtomicLong errorCount = new AtomicLong(0);

    @BeforeStep
    public void beforeStep(StepExecution stepExecution) {
        // Initialize from execution context if restarting
        ExecutionContext ctx = stepExecution.getExecutionContext();
        if (ctx.containsKey("processedCount")) {
            processedCount.set(ctx.getLong("processedCount"));
        }
    }

    @AfterStep
    public void afterStep(StepExecution stepExecution) {
        // Save state for potential restart
        ExecutionContext ctx = stepExecution.getExecutionContext();
        ctx.putLong("processedCount", processedCount.get());
        ctx.putLong("errorCount", errorCount.get());
    }

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        processedCount.incrementAndGet();

        try {
            return transform(item);
        } catch (Exception e) {
            errorCount.incrementAndGet();
            throw e;
        }
    }

    private {{Output}} transform({{Input}} item) {
        // Transformation logic
        return {{Output}}.builder()
            .id(item.getId())
            .build();
    }

    public long getProcessedCount() {
        return processedCount.get();
    }

    public long getErrorCount() {
        return errorCount.get();
    }
}
```

---

## Processor Error Handling

```java
package {{package}}.processor;

import org.springframework.batch.item.ItemProcessor;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class SafeProcessor implements ItemProcessor<{{Input}}, {{Output}}> {

    @Override
    public {{Output}} process({{Input}} item) throws Exception {
        try {
            return doProcess(item);
        } catch (ValidationException e) {
            // Log and skip (return null)
            log.warn("Validation failed for item {}: {}", item.getId(), e.getMessage());
            return null;
        } catch (TransientException e) {
            // Re-throw for retry mechanism
            log.error("Transient error for item {}, will retry", item.getId());
            throw e;
        } catch (Exception e) {
            // Wrap in custom exception for skip handling
            log.error("Processing failed for item {}", item.getId(), e);
            throw new ProcessingException("Failed to process item: " + item.getId(), e);
        }
    }

    private {{Output}} doProcess({{Input}} item) throws Exception {
        // Actual processing logic
        return {{Output}}.builder()
            .id(item.getId())
            .build();
    }
}
```
