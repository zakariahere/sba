# JPA Persistence Skill

**Purpose**: Patterns and best practices for JPA-based Spring Batch implementations.

---

## When to Use JPA

**Good fit**:
- Complex domain models with relationships
- Need for entity lifecycle callbacks
- Existing JPA entities to reuse
- Moderate volumes (< 1M records per run)

**Avoid when**:
- Maximum performance required
- Simple flat data structures
- Very high volumes (> 10M records)
- Complex stored procedures needed

---

## Reader Patterns

### JpaPagingItemReader (Recommended)

```java
@Bean
@StepScope
public JpaPagingItemReader<SourceEntity> reader(
        EntityManagerFactory emf,
        @Value("#{jobParameters['date']}") String date) {

    return new JpaPagingItemReaderBuilder<SourceEntity>()
        .name("sourceEntityReader")
        .entityManagerFactory(emf)
        .queryString("SELECT e FROM SourceEntity e WHERE e.processDate = :date ORDER BY e.id")
        .parameterValues(Map.of("date", LocalDate.parse(date)))
        .pageSize(1000)  // Match chunk size
        .build();
}
```

### JpaCursorItemReader (Large datasets, Spring Batch 5+)

```java
@Bean
@StepScope
public JpaCursorItemReader<SourceEntity> cursorReader(EntityManagerFactory emf) {
    return new JpaCursorItemReaderBuilder<SourceEntity>()
        .name("sourceCursorReader")
        .entityManagerFactory(emf)
        .queryString("SELECT e FROM SourceEntity e ORDER BY e.id")
        .build();
}
```

### Named Query Reader

```java
// In entity:
@NamedQuery(name = "SourceEntity.findUnprocessed",
    query = "SELECT e FROM SourceEntity e WHERE e.status = 'PENDING'")

// In config:
@Bean
public JpaPagingItemReader<SourceEntity> namedQueryReader(EntityManagerFactory emf) {
    return new JpaPagingItemReaderBuilder<SourceEntity>()
        .name("namedQueryReader")
        .entityManagerFactory(emf)
        .queryString("SourceEntity.findUnprocessed")
        .pageSize(500)
        .build();
}
```

---

## Writer Patterns

### JpaItemWriter (Standard)

```java
@Bean
public JpaItemWriter<TargetEntity> writer(EntityManagerFactory emf) {
    JpaItemWriter<TargetEntity> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    return writer;
}
```

### JpaItemWriter with Clear (Memory optimization)

```java
@Bean
public JpaItemWriter<TargetEntity> writerWithClear(EntityManagerFactory emf) {
    JpaItemWriter<TargetEntity> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    writer.setClearPersistenceContext(true);  // Clear after each chunk
    return writer;
}
```

### Merge vs Persist Control

```java
@Bean
public JpaItemWriter<TargetEntity> persistWriter(EntityManagerFactory emf) {
    JpaItemWriter<TargetEntity> writer = new JpaItemWriter<>();
    writer.setEntityManagerFactory(emf);
    writer.setUsePersist(true);  // Use persist() instead of merge()
    return writer;
}
```

---

## Entity Design Patterns

### Batch-Optimized Entity

```java
@Entity
@Table(name = "batch_data",
    indexes = {
        @Index(name = "idx_status", columnList = "status"),
        @Index(name = "idx_process_date", columnList = "process_date")
    })
public class BatchEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE,
        generator = "batch_seq")
    @SequenceGenerator(name = "batch_seq",
        sequenceName = "batch_data_seq",
        allocationSize = 50)  // Match batch size for efficiency
    private Long id;

    @Column(name = "status", length = 20)
    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(name = "process_date")
    private LocalDate processDate;

    @Version  // Optimistic locking
    private Long version;

    // Avoid lazy loading in batch - use EAGER or explicit joins
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "parent_id")
    private ParentEntity parent;
}
```

### Audit Fields Pattern

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "updated_by")
    private String updatedBy;
}
```

---

## Performance Configuration

### application.yml

```yaml
spring:
  jpa:
    properties:
      hibernate:
        # Batch inserts
        jdbc:
          batch_size: 50
          batch_versioned_data: true
        # Ordering for batching
        order_inserts: true
        order_updates: true
        # Statistics (disable in prod)
        generate_statistics: false
        # Second-level cache (usually disable for batch)
        cache:
          use_second_level_cache: false
          use_query_cache: false
```

### Performance Tips

1. **Match page size to chunk size**:
   ```java
   .pageSize(chunkSize)  // Avoid multiple queries per chunk
   ```

2. **Use sequence allocation**:
   ```java
   @SequenceGenerator(allocationSize = 50)  // Reduce DB round trips
   ```

3. **Clear persistence context**:
   ```java
   writer.setClearPersistenceContext(true);  // Prevent memory bloat
   ```

4. **Avoid N+1 queries**:
   ```java
   // Use JOIN FETCH in JPQL
   "SELECT e FROM Entity e JOIN FETCH e.children WHERE ..."
   ```

---

## Common Pitfalls

### 1. LazyInitializationException
**Problem**: Accessing lazy-loaded collections outside transaction.
**Solution**: Use `JOIN FETCH` or `@EntityGraph`.

```java
@EntityGraph(attributePaths = {"items", "customer"})
@Query("SELECT o FROM Order o WHERE o.status = :status")
List<Order> findByStatus(@Param("status") Status status);
```

### 2. Memory Exhaustion
**Problem**: EntityManager accumulates entities.
**Solution**: Clear context after each chunk.

```java
writer.setClearPersistenceContext(true);
// Or manual clear in processor/writer
entityManager.clear();
```

### 3. Slow Batch Inserts
**Problem**: Individual inserts instead of batch.
**Solution**: Configure batching + use persist.

```yaml
hibernate.jdbc.batch_size: 50
hibernate.order_inserts: true
```

### 4. Sequence Contention
**Problem**: Single sequence causing DB bottleneck.
**Solution**: Use `allocationSize` or Hi-Lo strategy.

---

## Transaction Configuration

### Standard (Recommended)

```java
@Bean
public Step jpaStep(JobRepository jobRepository,
                    PlatformTransactionManager transactionManager) {
    return new StepBuilder("jpaStep", jobRepository)
        .<Input, Output>chunk(100, transactionManager)
        .reader(reader())
        .processor(processor())
        .writer(writer())
        .build();
}
```

### With Isolation Level

```java
@Bean
public PlatformTransactionManager batchTransactionManager(EntityManagerFactory emf) {
    JpaTransactionManager tm = new JpaTransactionManager(emf);
    tm.setDefaultTimeout(300);  // 5 minutes
    return tm;
}
```

---

## Testing with JPA

```java
@SpringBatchTest
@SpringBootTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class JpaBatchJobTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @Autowired
    private JobLauncherTestUtils jobLauncherTestUtils;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldProcessAllRecords() throws Exception {
        // Given
        entityManager.persist(new SourceEntity(...));
        entityManager.flush();

        // When
        JobExecution execution = jobLauncherTestUtils.launchJob();

        // Then
        assertThat(execution.getStatus()).isEqualTo(BatchStatus.COMPLETED);
    }
}
```
