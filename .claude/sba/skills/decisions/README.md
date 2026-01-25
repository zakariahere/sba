# Phase 2: Architecture Decision Skills

This directory contains detailed decision-making guides for Phase 2: Architecture. Each skill contains:
- Detailed questioning protocols
- Option analysis with trade-offs
- PostgreSQL-specific recommendations
- Code examples and patterns

## Decision Skills

### 1. ItemReader Strategy
**File**: `itemreader-strategy.md`
**When to use**: Deciding how to read data from the database
**Key topics**:
- Restartability requirements (chunk, exact record, full restart)
- JdbcCursorItemReader vs JdbcPagingItemReader vs Custom ItemStreamReader
- Chunk size tuning
- Database cursor optimization

**Questions to ask**:
- "Do you need to resume from chunk boundary or exact record?"
- "What's your chunk size preference?"
- "Are there transient database errors we should retry?"
- "Can you provide EXPLAIN PLAN for your query?"

### 2. ItemWriter Strategy
**File**: `itemwriter-strategy.md`
**When to use**: Deciding how to write output (CSV files, database, etc.)
**Key topics**:
- Single file vs multi-partition files
- CSV format specifications
- Dead letter file design
- Merge strategy for partition files
- OpenCSV library usage

**Questions to ask**:
- "Single output file or multiple partition files?"
- "What are the CSV format specs (delimiter, quotes, escaping)?"
- "Should we write failed records to dead letter file?"
- "If partition files, how do we merge?"

### 3. Fault Tolerance Strategy
**File**: `fault-tolerance-strategy.md`
**When to use**: Designing error handling, skip policy, and retry strategy
**Key topics**:
- Skip policy (what exceptions to skip)
- Retry policy (transient vs fatal exceptions)
- PostgreSQL-specific exceptions (DeadlockLoserDataAccessException, CannotGetJdbcConnectionException, etc.)
- Dead letter file content
- Skip listener implementation
- Monitoring and alerting

**Questions to ask**:
- "What makes a record invalid? (validation error, constraint violation, etc.)"
- "Have you experienced these database errors: deadlock, connection timeout, etc.?"
- "What's the maximum acceptable skip count?"
- "How many retries for transient errors?"
- "Should skipped records go to dead letter file?"

### 4. Restartability & Checkpointing Strategy
**File**: `restartability-strategy.md`
**When to use**: Understanding job restart capabilities and tracking progress
**Key topics**:
- Spring Batch ExecutionContext (state tracking)
- ItemStreamReader interface (custom restartability)
- Restart scenarios: chunk boundary, exact record, full restart
- Skip count tracking across restarts
- Job recovery and resumption

**Questions to ask**:
- "If job fails at 47M records, should we restart from chunk boundary or exact record?"
- "How do we track 'what's been processed'? (ExecutionContext, database, file marker?)"
- "Should skip count be preserved across restarts?"
- "Do we have a unique sequential ID for exact-record resume?"

---

## Decision Flow for Phase 2

```
START PHASE 2
    ↓
ARTIFACT COLLECTION
├─ Request DDL for source tables
├─ Request sample data (3-5 rows)
├─ Request target CSV format example
├─ Request transformation rules
├─ Request exception handling preferences
└─ Request restart preferences
    ↓
DECISION 1: ItemReader Strategy (load itemreader-strategy.md)
├─ Ask question blocks
├─ Present options (Cursor, Paging, Custom)
└─ Get approval
    ↓
DECISION 2: ItemWriter Strategy (load itemwriter-strategy.md)
├─ Ask question blocks
├─ Present options (Partition files, Single file, Queue-based)
└─ Get approval
    ↓
DECISION 3: Fault Tolerance Strategy (load fault-tolerance-strategy.md)
├─ Ask question blocks
├─ Present options (Lenient, Strict, Aggressive)
└─ Get approval
    ↓
DECISION 4: Restartability Strategy (load restartability-strategy.md)
├─ Ask question blocks
├─ Present scenarios (Chunk, Exact record, Full restart)
└─ Get approval
    ↓
DECISION 5-8: Parallelization, Pattern, Listeners, Scheduling
├─ Based on earlier decisions
├─ Document in ADRs 5-8
└─ Get approval
    ↓
CONFIRM TECH STACK
    ↓
MOVE TO PHASE 3
```

---

## Quick Reference: Question Categories

### ItemReader Questions
```
Block 1: Restartability
- "If job fails halfway, restart from: chunk/exact record/beginning?"
- "Resume key? (customer_id, timestamp, sequence?)"
- "How track progress? (ExecutionContext, database, file?)"

Block 2: Performance
- "Query result size? (100K, 1M, 10M, 100M?)"
- "Chunk size? (1000, 5000, 10000?)"
- "Filter in SQL or processor?"

Block 3: Database
- "Query duration? (seconds, minutes, hours?)"
- "Indexes on join columns?"
- "Expected locks/contention?"

Block 4: Exceptions
- "Seen: deadlock, connection timeout, connection refused?"
- "Retry transient errors automatically?"
- "Max retries?"
```

### ItemWriter Questions
```
Block 1: Output Structure
- "Single file or partition files?"
- "Naming convention for partitions?"
- "Automatic merge or manual?"

Block 2: CSV Format
- "Delimiter? (comma, pipe, tab, semicolon?)"
- "Quote character? (double quote, single?)"
- "Line terminator? (Unix \\n, Windows \\r\\n?)"
- "Buffer records before write? (how many?)"

Block 3: Error Handling
- "Failed record handling? (fail, skip, dead letter?)"
- "Dead letter file columns? (original_data, error_reason, timestamp?)"

Block 4: Restartability
- "On restart: overwrite or append output?"
- "Track 'number written' in ExecutionContext?"

Block 5: Multi-Thread
- "Each thread own file or shared file?"
- "If partition files: merge order matter?"
```

### Fault Tolerance Questions
```
Block 1: Skip Policy
- "What makes record invalid? (null field, constraint violation, validation rule?)"
- "Skip exceptions? (ValidationException, DataIntegrityViolationException?)"
- "Max skip count? (1000, 50000, no limit?)"
- "Skip limit exceeded: fail or continue?"
- "Dead letter file? (what columns?)"

Block 2: Retry Policy
- "Transient exceptions seen? (deadlock, connection timeout, etc.?)"
- "Retry strategy? (yes/no, how many times?)"
- "Backoff type? (fixed, exponential, random?)"
- "Max retry time? (10 seconds, 60 seconds?)"

Block 3: Exception Categories
- "Skippable? (ValidationException, ...?)"
- "Retryable? (DeadlockLoserDataAccessException, ...?)"
- "Fatal? (FatalProcessingException, ...?)"
```

### Restartability Questions
```
Block 1: Restart Granularity
- "Chunk boundary, exact record, or full restart?"
- "Cost of reprocessing 1M records? (quick/expensive/very expensive?)"
- "How often expect restarts? (rarely/sometimes/frequently?)"

Block 2: Tracking Progress
- "Preserve skip count across restarts?"
- "Have unique sequential ID for resume? (customer_id?)"

Block 3: Resume Strategy
- "Use ExecutionContext (Spring default) or custom?"
- "If restart: avoid duplicate processing?"
```

---

## Common Patterns by Use Case

### Large ETL (100M+ records)
**Recommended**:
- ItemReader: JdbcCursorItemReader (simple, fast)
- ItemWriter: Partition files + merge (100% parallelism)
- Fault Tolerance: Lenient (skip + retry)
- Restart: Chunk boundary (simple, adequate)

### Data Migration (1M-10M records)
**Recommended**:
- ItemReader: JdbcCursorItemReader
- ItemWriter: Single file (simpler, no merge)
- Fault Tolerance: Strict (clean data expected)
- Restart: Exact record (if resume needed)

### Report Generation (aggregations)
**Recommended**:
- ItemReader: Custom (complex joins, aggregations)
- ItemWriter: Single file
- Fault Tolerance: Lenient (skip invalid records)
- Restart: Full restart (cache busting)

---

## For the Agent: Usage Instructions

1. **When in Phase 2**, reference these skills by path
2. **Ask interactively**: Follow the question blocks
3. **Present options**: Show 2-3 choices with trade-offs
4. **Get approval**: Don't proceed without user agreement
5. **Document decisions**: Create ADRs (one per decision)
6. **Validate with artifacts**: Review actual schema/data

**Example usage**:
```
User asks: "How should we handle database deadlocks?"

Agent:
1. Loads fault-tolerance-strategy.md
2. Asks Block 2 questions: "Have you experienced deadlock? How many retries?"
3. Shows retry options from the skill
4. Recommends: "ExponentialBackOffPolicy with 3 retries"
5. Documents in ADR-003
6. Moves to next decision
```

---

