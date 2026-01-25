# Reader Templates

**Purpose**: ItemReader implementations for various data sources.

---

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{Input}}` | Input DTO/Entity type | `CustomerInput` |
| `{{tableName}}` | Database table name | `customers` |
| `{{package}}` | Base package | `com.company.batch` |
| `{{query}}` | SQL query | `SELECT * FROM customers` |

---

## JDBC Cursor Reader

Best for: Large datasets, streaming, single connection.

```java
package {{package}}.reader;

import org.springframework.batch.item.database.JdbcCursorItemReader;
import org.springframework.batch.item.database.builder.JdbcCursorItemReaderBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import javax.sql.DataSource;

@Configuration
public class {{Input}}ReaderConfig {

    @Bean
    @StepScope
    public JdbcCursorItemReader<{{Input}}> {{input}}Reader(
            DataSource dataSource,
            @Value("#{jobParameters['processDate']}") String processDate) {

        return new JdbcCursorItemReaderBuilder<{{Input}}>()
            .name("{{input}}CursorReader")
            .dataSource(dataSource)
            .sql("""
                SELECT id, field1, field2, created_at
                FROM {{tableName}}
                WHERE status = 'PENDING'
                  AND process_date = ?
                ORDER BY id
                """)
            .preparedStatementSetter(ps -> {
                ps.setDate(1, java.sql.Date.valueOf(processDate));
            })
            .rowMapper(new {{Input}}RowMapper())
            .fetchSize(1000)
            .build();
    }
}
```

---

## JDBC Paging Reader

Best for: Restartability, releasing connections between pages.

```java
package {{package}}.reader;

import org.springframework.batch.item.database.JdbcPagingItemReader;
import org.springframework.batch.item.database.builder.JdbcPagingItemReaderBuilder;
import org.springframework.batch.item.database.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import javax.sql.DataSource;
import java.util.Map;

@Configuration
public class {{Input}}PagingReaderConfig {

    @Bean
    @StepScope
    public JdbcPagingItemReader<{{Input}}> {{input}}PagingReader(
            DataSource dataSource,
            @Value("#{jobParameters['status']}") String status) {

        return new JdbcPagingItemReaderBuilder<{{Input}}>()
            .name("{{input}}PagingReader")
            .dataSource(dataSource)
            .selectClause("SELECT id, field1, field2, created_at")
            .fromClause("FROM {{tableName}}")
            .whereClause("WHERE status = :status")
            .sortKeys(Map.of("id", Order.ASCENDING))
            .parameterValues(Map.of("status", status))
            .pageSize(1000)
            .rowMapper(new {{Input}}RowMapper())
            .build();
    }
}
```

---

## JPA Paging Reader

Best for: JPA-based applications, entity relationships.

```java
package {{package}}.reader;

import org.springframework.batch.item.database.JpaPagingItemReader;
import org.springframework.batch.item.database.builder.JpaPagingItemReaderBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import jakarta.persistence.EntityManagerFactory;
import java.util.Map;

@Configuration
public class {{Input}}JpaReaderConfig {

    @Bean
    @StepScope
    public JpaPagingItemReader<{{Input}}> {{input}}JpaReader(
            EntityManagerFactory entityManagerFactory,
            @Value("#{jobParameters['processDate']}") String processDate) {

        return new JpaPagingItemReaderBuilder<{{Input}}>()
            .name("{{input}}JpaReader")
            .entityManagerFactory(entityManagerFactory)
            .queryString("""
                SELECT e FROM {{Input}} e
                WHERE e.status = 'PENDING'
                  AND e.processDate = :processDate
                ORDER BY e.id
                """)
            .parameterValues(Map.of(
                "processDate", java.time.LocalDate.parse(processDate)
            ))
            .pageSize(1000)
            .build();
    }
}
```

---

## Flat File Reader (CSV)

Best for: CSV file input.

```java
package {{package}}.reader;

import org.springframework.batch.item.file.FlatFileItemReader;
import org.springframework.batch.item.file.builder.FlatFileItemReaderBuilder;
import org.springframework.batch.item.file.mapping.BeanWrapperFieldSetMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.core.io.FileSystemResource;

@Configuration
public class {{Input}}FileReaderConfig {

    @Bean
    @StepScope
    public FlatFileItemReader<{{Input}}> {{input}}FileReader(
            @Value("#{jobParameters['inputFile']}") String inputFile) {

        return new FlatFileItemReaderBuilder<{{Input}}>()
            .name("{{input}}FileReader")
            .resource(new FileSystemResource(inputFile))
            .linesToSkip(1)  // Skip header
            .delimited()
            .delimiter(",")
            .names("id", "field1", "field2", "createdAt")
            .fieldSetMapper(new BeanWrapperFieldSetMapper<>() {{
                setTargetType({{Input}}.class);
            }})
            .build();
    }
}
```

---

## Flat File Reader (Fixed Width)

Best for: Fixed-width file formats.

```java
package {{package}}.reader;

import org.springframework.batch.item.file.FlatFileItemReader;
import org.springframework.batch.item.file.builder.FlatFileItemReaderBuilder;
import org.springframework.batch.item.file.transform.Range;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;

@Configuration
public class {{Input}}FixedWidthReaderConfig {

    @Bean
    @StepScope
    public FlatFileItemReader<{{Input}}> {{input}}FixedWidthReader(
            @Value("#{jobParameters['inputFile']}") String inputFile) {

        return new FlatFileItemReaderBuilder<{{Input}}>()
            .name("{{input}}FixedWidthReader")
            .resource(new FileSystemResource(inputFile))
            .fixedLength()
            .columns(
                new Range(1, 10),    // id
                new Range(11, 50),   // field1
                new Range(51, 100),  // field2
                new Range(101, 110)  // date
            )
            .names("id", "field1", "field2", "createdAt")
            .targetType({{Input}}.class)
            .build();
    }
}
```

---

## JSON File Reader

Best for: JSON array input files.

```java
package {{package}}.reader;

import org.springframework.batch.item.json.JacksonJsonObjectReader;
import org.springframework.batch.item.json.JsonItemReader;
import org.springframework.batch.item.json.builder.JsonItemReaderBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;

@Configuration
public class {{Input}}JsonReaderConfig {

    @Bean
    @StepScope
    public JsonItemReader<{{Input}}> {{input}}JsonReader(
            @Value("#{jobParameters['inputFile']}") String inputFile) {

        return new JsonItemReaderBuilder<{{Input}}>()
            .name("{{input}}JsonReader")
            .resource(new FileSystemResource(inputFile))
            .jsonObjectReader(new JacksonJsonObjectReader<>({{Input}}.class))
            .build();
    }
}
```

---

## XML File Reader

Best for: XML input files.

```java
package {{package}}.reader;

import org.springframework.batch.item.xml.StaxEventItemReader;
import org.springframework.batch.item.xml.builder.StaxEventItemReaderBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.oxm.jaxb.Jaxb2Marshaller;

@Configuration
public class {{Input}}XmlReaderConfig {

    @Bean
    @StepScope
    public StaxEventItemReader<{{Input}}> {{input}}XmlReader(
            @Value("#{jobParameters['inputFile']}") String inputFile) {

        Jaxb2Marshaller marshaller = new Jaxb2Marshaller();
        marshaller.setClassesToBeBound({{Input}}.class);

        return new StaxEventItemReaderBuilder<{{Input}}>()
            .name("{{input}}XmlReader")
            .resource(new FileSystemResource(inputFile))
            .addFragmentRootElements("{{rootElement}}")
            .unmarshaller(marshaller)
            .build();
    }
}
```

---

## Partitioned Reader

Best for: Parallel processing with data partitions.

```java
package {{package}}.reader;

import org.springframework.batch.item.database.JdbcPagingItemReader;
import org.springframework.batch.item.database.builder.JdbcPagingItemReaderBuilder;
import org.springframework.batch.item.database.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.batch.core.configuration.annotation.StepScope;
import javax.sql.DataSource;
import java.util.Map;

@Configuration
public class {{Input}}PartitionedReaderConfig {

    @Bean
    @StepScope
    public JdbcPagingItemReader<{{Input}}> partitionedReader(
            DataSource dataSource,
            @Value("#{stepExecutionContext['minId']}") Long minId,
            @Value("#{stepExecutionContext['maxId']}") Long maxId) {

        return new JdbcPagingItemReaderBuilder<{{Input}}>()
            .name("partitioned{{Input}}Reader")
            .dataSource(dataSource)
            .selectClause("SELECT id, field1, field2")
            .fromClause("FROM {{tableName}}")
            .whereClause("WHERE id >= :minId AND id <= :maxId")
            .sortKeys(Map.of("id", Order.ASCENDING))
            .parameterValues(Map.of("minId", minId, "maxId", maxId))
            .pageSize(1000)
            .rowMapper(new {{Input}}RowMapper())
            .build();
    }
}
```

---

## Row Mapper

```java
package {{package}}.mapper;

import org.springframework.jdbc.core.RowMapper;
import java.sql.ResultSet;
import java.sql.SQLException;

public class {{Input}}RowMapper implements RowMapper<{{Input}}> {

    @Override
    public {{Input}} mapRow(ResultSet rs, int rowNum) throws SQLException {
        return {{Input}}.builder()
            .id(rs.getLong("id"))
            .field1(rs.getString("field1"))
            .field2(rs.getString("field2"))
            .createdAt(rs.getTimestamp("created_at").toLocalDateTime())
            .build();
    }
}
```

---

## Custom ItemReader

Best for: APIs, custom data sources.

```java
package {{package}}.reader;

import org.springframework.batch.item.ItemReader;
import org.springframework.batch.item.ItemStream;
import org.springframework.batch.item.ExecutionContext;
import org.springframework.stereotype.Component;
import org.springframework.batch.core.configuration.annotation.StepScope;

@Component
@StepScope
public class {{Input}}ApiReader implements ItemReader<{{Input}}>, ItemStream {

    private final ApiClient apiClient;
    private Iterator<{{Input}}> iterator;
    private int currentPage = 0;
    private boolean exhausted = false;

    @Override
    public void open(ExecutionContext executionContext) {
        if (executionContext.containsKey("currentPage")) {
            this.currentPage = executionContext.getInt("currentPage");
        }
        fetchNextPage();
    }

    @Override
    public {{Input}} read() {
        if (iterator != null && iterator.hasNext()) {
            return iterator.next();
        }

        if (!exhausted) {
            currentPage++;
            fetchNextPage();
            if (iterator != null && iterator.hasNext()) {
                return iterator.next();
            }
        }

        return null;  // End of data
    }

    @Override
    public void update(ExecutionContext executionContext) {
        executionContext.putInt("currentPage", currentPage);
    }

    @Override
    public void close() {
        // Cleanup
    }

    private void fetchNextPage() {
        List<{{Input}}> page = apiClient.fetchPage(currentPage, 1000);
        if (page.isEmpty()) {
            exhausted = true;
            iterator = null;
        } else {
            iterator = page.iterator();
        }
    }
}
```
