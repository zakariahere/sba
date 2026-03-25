# Decision: ItemWriter Strategy

**When to use this skill**: During Phase 2: Architecture when deciding how to write output (CSV, database, file, etc.).

**Token budget**: ~2k tokens

---

## Questioning Protocol

Ask the user these questions BEFORE recommending a writer strategy:

### Block 1: Output File Structure

```
Q1: "Should we produce:
     a) Single CSV file (customer_etl_output.csv)?
     b) Multiple partition files that merge after processing?
     c) Streaming output (no buffering)?"

Q2: "If multiple partition files:
     - How are they named? (partition_0001.csv, partition_0002.csv, etc.)
     - Do they merge automatically after processing?
     - In what order?
     - Are temporary files cleaned up?"

Q3: "Can the output file be:
     a) Overwritten (completely rewritten on restart)?
     b) Appended to (add new rows)?
     c) Requires atomic write (all-or-nothing)?"
```

**Why ask**: Determines if you need multi-partition files or single writer. Affects parallelism strategy.

### Block 2: CSV Format & Buffering

```
Q4: "CSV format specifications:
     - Delimiter? (comma, pipe, tab, semicolon?)
     - Quote character? (double quote, single quote?)
     - Line terminator? (\\n Unix, \\r\\n Windows, other?)
     - Escape character?
     - Include header row? (Yes/No)
     - Any special handling for NULL values?"

Q5: "Should records be buffered in memory before writing?
     a) Yes, buffer 10K items then flush
     b) Yes, buffer 50K items then flush
     c) No, stream directly (write immediately)"

Q6: "What's the expected output file size?
     - Small: <1GB
     - Medium: 1-10GB
     - Large: 10-100GB
     - Huge: >100GB"
```

**Why ask**: Determines buffering strategy, memory requirements, flush frequency.

### Block 3: Error Handling & Dead Letters

```
Q7: "If a record fails to write:
     a) Fail the entire job?
     b) Skip the record and log it?
     c) Write to dead letter file for later review?"

Q8: "If dead letter file:
     - What columns should it contain?
       (original_data, error_reason, timestamp, partition_id?)
     - Should it be human-readable CSV or raw binary?"

Q9: "Should write errors be logged to:
     a) File (dead_letters.csv)?
     b) Database table (batch_errors)?
     c) Both?"
```

**Why ask**: Determines error handling strategy and visibility into failures.

### Block 4: Writer Restartability

```
Q10: "On job restart, should we:
      a) Overwrite the entire output file?
      b) Resume appending from where we left off?
      c) Require manual intervention to handle partial output?"

Q11: "How do we know 'what's been written'?
      a) Track record count in ExecutionContext?
      b) Delete output file on restart?
      c) Use a separate 'processed items' log?"
```

**Why ask**: Determines if writer needs to be idempotent or can handle restart cleanly.

### Block 5: Multi-Thread Coordination (if partitioned)

```
Q12: "Multiple partition threads writing simultaneously:
      a) Each thread to its own file (partition_0001.csv, partition_0002.csv)?
      b) All threads write to same file (needs coordination)?
      c) Asynchronous queue-based writing (single writer thread)?"

Q13: "If multiple files:
      - Do they stay separate or merge?
      - When? (during job or post-job)?
      - Is merge atomic or best-effort?"
```

**Why ask**: Determines parallelism strategy and threading complexity.

---

## Option Analysis

Based on their answers, present these options:

### Option A: FlatFileItemWriter to Partition Files (RECOMMENDED for parallelization)

**When to use**:
- Parallel partitioned processing (8+ partition threads)
- Each partition writes independently
- No thread contention needed
- Post-job merge acceptable

**How it works**:
```
Partition 1 Thread → FlatFileItemWriter → partition_0001.csv
Partition 2 Thread → FlatFileItemWriter → partition_0002.csv
Partition 3 Thread → FlatFileItemWriter → partition_0003.csv
...
Post-Job Tasklet → Merge all files → customer_etl_output.csv
```

**Configuration**:
```java
@Bean
@StepScope
public FlatFileItemWriter<CustomerOutput> csvWriter(
        @Value("#{stepExecutionContext['partitionId']}") String partitionId) {
    return new FlatFileItemWriterBuilder<CustomerOutput>()
        .name("csvWriter")
        .resource(new FileSystemResource("partition_" + partitionId + ".csv"))
        .delimited()
        .delimiter(',')
        .names("customerId", "customerName", "email", "address", "city", "orderCount", "totalSpent")
        .headerCallback(writer -> {
            // Only write header for partition 1
            if ("1".equals(partitionId)) {
                writer.write("customerId,customerName,email,address,city,orderCount,totalSpent");
            }
        })
        .build();
}
```

**Parallelism**: 8 threads × 100K rows/sec = 800K rows/sec throughput
**Restart**: Each partition is independent; can retry single partition without reprocessing others
**Merge time**: ~3-4 minutes for 100M records (post-job, binary concatenation)

**Best for**: Your scenario (100M records, 8 partitions, tight time window)

---

### Option B: FlatFileItemWriter to Single File (Requires coordination)

**When to use**:
- Single-threaded or low-concurrency
- All data must go to one file immediately
- Merge overhead unacceptable

**How it works**:
```
All partition threads → Synchronized writer → customer_etl_output.csv
```

**Problem**: Multiple threads writing to same file = locking = contention = slow writes

**Configuration**:
```java
// PROBLEMATIC - don't do this with multiple threads
.delimited()
.resource(new FileSystemResource("customer_etl_output.csv"))
// Multiple threads compete for single file lock
```

**Trade-off**: Simpler setup but 8× slower throughput (bottleneck on single writer).

**NOT RECOMMENDED for parallelized batch jobs**.

---

### Option C: BlockingQueue + Async Writer (Complex coordination)

**When to use**:
- Need single output file without post-merge
- Willing to add queue coordination complexity

**How it works**:
```
Partition threads → Put to BlockingQueue → Writer thread reads and writes to file
```

**Problem**: Queue fills immediately (8 threads at 100K/sec vs 1 writer at 100K/sec)
→ Threads block waiting for queue space
→ Effective parallelism drops to 12.5%
→ Same speed as single-threaded

**NOT RECOMMENDED for large-scale batch**.

---

## PostgreSQL CSV Specifics

**RFC 4180 Compliance** (what OpenCSV handles):

```csv
Field with comma: "123 Main St, Apt 4B"
Field with quote: "O'Brien"
Field with newline: "Line1
Line2"
NULL handling: Can be empty, can be "NULL", or specific marker
```

**OpenCSV Configuration**:
```java
.delimited()
.delimiter(',')
.quoteCharacter('"')
.escapeCharacter('"')
.lineTerminator("\n")  // Unix line terminator
```

---

## Merge Tasklet (Post-Processing for Multi-Partition Files)

```java
@Bean
public Step csvMergeStep() {
    return new StepBuilder("csvMergeStep", jobRepository)
        .tasklet(csvMergeTasklet(), transactionManager)
        .build();
}

@Bean
public Tasklet csvMergeTasklet() {
    return (contribution, chunkContext) -> {
        Path outputFile = Paths.get("customer_etl_output.csv");

        try (FileOutputStream fos = new FileOutputStream(outputFile.toFile());
             BufferedOutputStream bos = new BufferedOutputStream(fos)) {

            // Write header once
            bos.write("customerId,customerName,email,address,city,orderCount,totalSpent\n".getBytes());

            // Merge partition files in order
            for (int i = 1; i <= 8; i++) {
                Path partitionFile = Paths.get(String.format("partition_%04d.csv", i));
                if (Files.exists(partitionFile)) {
                    Files.copy(partitionFile, bos);  // Binary copy (fast)
                    Files.delete(partitionFile);
                }
            }

            return RepeatStatus.FINISHED;
        }
    };
}
```

**Time**: Binary concatenation of 100M rows ≈ 3-4 minutes
**Memory**: Constant (buffered I/O, not in-memory)

---

## Questions to Ask User

After presenting options, confirm:

- [ ] Single output file or partition files?
- [ ] If partition files: merge strategy and timing?
- [ ] Dead letter file required? What columns?
- [ ] CSV format specs (delimiter, quotes, line terminator)?
- [ ] Expected output file size? (affects buffer sizing)
- [ ] Restart behavior? (overwrite or append?)

**Document the decision in ADR-002: ItemWriter Strategy**

---

