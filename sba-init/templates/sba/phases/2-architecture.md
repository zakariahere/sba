# Phase 2: Architecture

**Goal**: Make architecture decisions WITH USER PARTICIPATION. Document decisions as ADRs.

**This phase is interactive**: The agent asks detailed questions, presents options, and gets user approval before proceeding.

**Token Budget**: ~4k tokens (this file + skill references + ADRs)

---

## Entry Checklist

- [ ] Phase 1 complete with populated project_context
- [ ] Sources and targets defined
- [ ] Volume classification known
- [ ] User ready to provide schema details

---

## Artifact Collection (Phase 2 Start)

**Before making ANY architecture decisions, request and collect these from user**:

1. **Database Schema (DDL)**
   - CREATE TABLE statements for all source tables
   - Request: `Can you provide the DDL for all tables we're reading from?`

2. **Sample Data** (3-5 rows per table, anonymized)
   - Request: `Can you provide sample rows from each table?`

3. **Target CSV Format Example**
   - Header row + 2 sample output rows
   - Request: `Show me the desired CSV output format (header + examples)`

4. **Transformation Rules**
   - Column mappings: source → target
   - Any calculations, aggregations, format conversions
   - Request: `Document the transformation logic per column`

5. **Exception & Error Preferences**
   - What exceptions to skip, retry, or fail on
   - Request: `Have you experienced database errors? Which should we handle?`

6. **Restart Preferences**
   - How to handle job failure and resumption
   - Request: `If job fails halfway, should we restart from chunk or exact record?`

---

## Architecture Decisions (Interactive)

### Decision 1: ItemReader Strategy

**Skills to Load**: `{{AGENT_DIR}}/sba/skills/decisions/itemreader-strategy.md`

**Agent Process**:
1. Load the ItemReader skill file
2. Ask user the question blocks from the skill:
   - Restartability & checkpointing questions
   - Data volume & performance questions
   - Database behavior questions
   - Exception handling questions
3. Present the 3 options:
   - Option A: JdbcCursorItemReader (default)
   - Option B: JdbcPagingItemReader (better restart support)
   - Option C: Custom ItemStreamReader (maximum control)
4. Get user approval on their choice
5. Document in **ADR-001: ItemReader Strategy**

**User Approval Gates**:
- [ ] ItemReader option chosen
- [ ] Restartability strategy understood
- [ ] Chunk size agreed
- [ ] Transient database errors enumerated

---

### Decision 2: ItemWriter Strategy

**Skills to Load**: `{{AGENT_DIR}}/sba/skills/decisions/itemwriter-strategy.md`

**Agent Process**:
1. Load the ItemWriter skill file
2. Ask user the question blocks from the skill:
   - Output file structure questions
   - CSV format & buffering questions
   - Error handling & dead letter questions
   - Writer restartability questions
   - Multi-thread coordination questions
3. Present the 3 options:
   - Option A: Partition files with post-merge (RECOMMENDED for parallelization)
   - Option B: Single file with coordination (not recommended)
   - Option C: Queue-based async writer (complex, bottleneck)
4. Get user approval on their choice
5. Document in **ADR-002: ItemWriter Strategy**

**User Approval Gates**:
- [ ] Writer option chosen
- [ ] CSV format specifications confirmed
- [ ] Dead letter file design (if needed)
- [ ] Merge strategy decided (if multi-partition)

---

### Decision 3: Fault Tolerance Strategy

**Skills to Load**: `{{AGENT_DIR}}/sba/skills/decisions/fault-tolerance-strategy.md`

**Agent Process**:
1. Load the Fault Tolerance skill file
2. Ask user the question blocks from the skill:
   - Skip policy questions (what makes a record invalid)
   - Retry policy questions (transient DB errors)
   - Exception categorization (skip vs retry vs fail)
   - Restart & resumption questions
3. Present 3 strategies:
   - Option A: Lenient (skip + retry + dead letters)
   - Option B: Strict (fail on first error)
   - Option C: Aggressive (many retries)
4. Get user approval on their choice
5. Document in **ADR-003: Fault Tolerance Strategy**

**User Approval Gates**:
- [ ] Skip exceptions enumerated
- [ ] Skip limits set
- [ ] Retry exceptions enumerated
- [ ] Retry count & backoff strategy decided
- [ ] Dead letter file design complete

---

### Decision 4: Restartability & Checkpointing

**Skills to Load**: `{{AGENT_DIR}}/sba/skills/decisions/restartability-strategy.md`

**Agent Process**:
1. Load the Restartability skill file
2. Ask user the question blocks from the skill:
   - Restart granularity questions
   - ExecutionContext usage questions
   - Skip count tracking questions
3. Present 3 scenarios:
   - Scenario 1: Restart from chunk boundary (default, RECOMMENDED)
   - Scenario 2: Restart from exact record (custom ItemStreamReader)
   - Scenario 3: Full restart from beginning (simple but slow)
4. Get user approval on their choice
5. Document in **ADR-004: Restart & Checkpointing Strategy**

**User Approval Gates**:
- [ ] Restart granularity chosen
- [ ] Skip count tracking method decided
- [ ] ExecutionContext strategy understood

---

### Decision 5: Parallelization Strategy

Based on Decisions 1-4, now decide on parallelization:

**Questions**:
- "How many partition threads? (8 is our recommendation for 100M records)"
- "Database connection pool can support 20 connections?"
- "Disk space for partition files available? (need 2× output file space)"
- "Time window tight? (5-6 minutes processing + 3-4 minutes merge acceptable?)"

**Decision Tree**:
```
Volume = 100M, Performance critical, Multi-partition files + post-merge?
→ Partitioning with 8 worker threads RECOMMENDED
→ Each partition writes to independent file
→ Post-job merge combines files
→ Actual parallelism: 100% (no bottlenecks)
```

**Document in ADR-005: Parallelization Strategy**

---

### Decision 6: Processing Pattern

Based on all above decisions:

```yaml
Pattern: Chunk Processing with Partitioning

Job Structure:
  1. Partition Manager Step (manager step)
  2. 8 Worker Steps (in parallel)
     - Each: Read + Process + Write to partition file
  3. CSV Merge Tasklet (aggregate partitions)

Flow:
  Start → Partition Manager → [Worker 1, 2, ..., 8 in parallel] → Merge → End
```

**Document in ADR-006: Processing Pattern & Job Structure**

---

### Decision 7: Error Handling & Monitoring

Based on fault tolerance strategy:

**Components to implement**:
- Skip listeners (track skipped records, write dead letter file)
- Retry listeners (log retry attempts)
- Job completion listener (summarize execution)

**Document in ADR-007: Listeners & Monitoring**

---

### Decision 8: Async Job Scheduling

**For long-running jobs, must be non-blocking**:

```yaml
Scheduling Strategy:
  @Scheduled trigger → Returns immediately
  @Async method → Runs in background thread pool
  Background execution → Doesn't block scheduler

Configuration:
  batchJobExecutor thread pool: 2-4 concurrent jobs
  scheduler thread pool: separate from batch executor
```

**Document in ADR-008: Async Job Scheduling**

---

## Questions Throughout Phase 2

**Agent MUST ask interactively**:

- [ ] "Can you share the DDL for your source tables?"
- [ ] "Can you show me the desired CSV output format?"
- [ ] "What transient database errors have you seen?"
- [ ] "How do you want to handle invalid records?"
- [ ] "If job fails, should we resume from checkpoint or restart?"
- [ ] "What's your maximum acceptable skip rate?"
- [ ] "Can your database connection pool handle 20 connections?"
- [ ] "Do you have ~120GB disk space for partition processing?"

---

## Architecture Decision Records (ADRs)

**8 ADRs to create during this phase**:

1. ADR-001: ItemReader Strategy
2. ADR-002: ItemWriter Strategy
3. ADR-003: Fault Tolerance Strategy
4. ADR-004: Restart & Checkpointing Strategy
5. ADR-005: Parallelization Strategy
6. ADR-006: Processing Pattern & Job Structure
7. ADR-007: Listeners & Monitoring
8. ADR-008: Async Job Scheduling

**ADR Format**:
```markdown
### ADR-NNN: {Title}

**Status**: Accepted

**Context**: {Why this decision matters}

**Decision**: {What we decided}

**Consequences**:
- Positive: {benefit}
- Trade-off: {negative}
- Mitigation: {how to address negative}

**Alternatives Considered**:
- Alternative: {Why rejected}
```

---

## Technology Stack Confirmation

After all decisions, confirm:

```yaml
tech_stack:
  processing_pattern: "Chunk Processing with Partitioning"
  persistence: "JDBC"
  database: "PostgreSQL"
  csv_library: "OpenCSV"
  parallelization: "ThreadPoolTaskExecutor (8 threads)"
  chunk_size: 1000
  partition_count: 8
  database_pool_size: 20
  jvm_heap: "2GB"
  spring_boot: "3.2.x"
  java_version: "17"

dependencies:
  - spring-batch-core: 5.x
  - spring-batch-infrastructure: 5.x
  - postgresql-driver: 42.7.x
  - opencsv: 5.9.x
  - spring-retry: 2.0.x
```

---

## Transition Criteria (STRICT)

**Phase 3 ONLY begins when ALL of these are complete**:

### User Artifacts Collected
- [ ] DDL statements for source tables provided
- [ ] Sample data (3-5 rows per table) provided
- [ ] Target CSV format example provided
- [ ] Transformation rules documented
- [ ] Exception handling preferences stated

### Decisions Made WITH User Approval
- [ ] ADR-001: ItemReader Strategy (APPROVED)
- [ ] ADR-002: ItemWriter Strategy (APPROVED)
- [ ] ADR-003: Fault Tolerance Strategy (APPROVED)
- [ ] ADR-004: Restart & Checkpointing Strategy (APPROVED)
- [ ] ADR-005: Parallelization Strategy (APPROVED)
- [ ] ADR-006: Processing Pattern & Job Structure (APPROVED)
- [ ] ADR-007: Listeners & Monitoring (APPROVED)
- [ ] ADR-008: Async Job Scheduling (APPROVED)

### Tech Stack Confirmed
- [ ] Database details confirmed (PostgreSQL, connection pool size)
- [ ] Performance targets understood (chunk size, thread count)
- [ ] Resource constraints acknowledged (disk space, memory)
- [ ] Output format finalized

### User Sign-Off
- [ ] User explicitly says "Architecture approved" or similar
- [ ] No unresolved questions remain
- [ ] User understands all trade-offs

---

## Transition to Phase 3

```
Once all criteria met:
→ Load selected skills from skill catalog for design phase
→ Read {{AGENT_DIR}}/sba/phases/3-design.md
→ Begin code generation (DTOs, SQL queries, step configs)

Current Phase State:
  current_phase: 3
  tech_stack: {confirmed above}
  decisions: [{all 8 ADRs}]
  artifacts_collected: {DDL, sample data, transformation rules}
```

---

## Agent Instructions (Summary)

1. **Load skills on-demand**: Don't load all at once; reference them by path
2. **Ask questions interactively**: Gather requirements before deciding
3. **Present options with trade-offs**: Show 2-3 choices, explain each
4. **Get approval**: Don't proceed without user agreement
5. **Document everything**: Create ADRs as you go
6. **Validate with artifacts**: Review actual schema/data before finalizing

---

**IMPORTANT**: Phase 2 should be 30-40% of total effort. Don't rush to Phase 3. Architecture is the most expensive decision to change later.

