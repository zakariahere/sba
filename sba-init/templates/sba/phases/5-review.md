# Phase 5: Review & Optimize

**Goal**: Validate implementation against best practices and optimize for production.

**Token Budget**: ~5k tokens (this file + checklist)

---

## Entry Checklist

- [ ] Phase 4 complete with all artifacts generated
- [ ] Code compiles successfully
- [ ] Basic tests pass

---

## Review Activities

### 1. Code Quality Review

#### Configuration Review
- [ ] Job properly configured with `JobBuilderFactory`/`JobBuilder`
- [ ] Steps properly configured with `StepBuilderFactory`/`StepBuilder`
- [ ] Transaction boundaries correct
- [ ] Bean scopes appropriate (`@StepScope` where needed)
- [ ] No circular dependencies

#### Reader Review
- [ ] Proper resource handling (streams closed)
- [ ] Pagination configured correctly (if applicable)
- [ ] Query optimized (indexes used)
- [ ] Fetch size appropriate for volume
- [ ] Thread-safe (if multi-threaded)

#### Processor Review
- [ ] Null handling correct (null = skip item)
- [ ] Validation comprehensive
- [ ] Transformation logic correct
- [ ] No side effects
- [ ] Stateless (or properly thread-safe)

#### Writer Review
- [ ] Batch operations used (not single inserts)
- [ ] Transaction boundaries respected
- [ ] Error handling doesn't lose data
- [ ] Proper flush/clear for JPA

### 2. Performance Review

#### Chunk Size Optimization
```
Current: {chunk_size}
Recommendation: {adjusted_size if needed}
Rationale: {why}
```

#### Database Optimization
- [ ] Proper indexes exist for queries
- [ ] Batch insert/update configured
- [ ] Connection pool sized appropriately
- [ ] Query plans reviewed (no full table scans)

**JPA-Specific**:
- [ ] `hibernate.jdbc.batch_size` configured
- [ ] `hibernate.order_inserts=true`
- [ ] `hibernate.order_updates=true`
- [ ] Session cleared periodically

**JDBC-Specific**:
- [ ] `rewriteBatchedStatements=true` (MySQL)
- [ ] Prepared statements reused
- [ ] Fetch size configured

#### Memory Optimization
- [ ] No large collections accumulated
- [ ] Streaming used where possible
- [ ] Pagination prevents OOM
- [ ] Heap size recommendations documented

#### Parallelization Review (if applicable)
- [ ] Thread pool sized correctly
- [ ] Throttle limit appropriate
- [ ] Grid size optimal for partitioning
- [ ] No thread-safety issues

### 3. Fault Tolerance Review

#### Skip Policy
- [ ] Skip exceptions correctly identified
- [ ] Skip limit appropriate
- [ ] Skipped items logged/tracked
- [ ] No data loss from skips

#### Retry Policy
- [ ] Retry exceptions correctly identified
- [ ] Retry limit reasonable
- [ ] Backoff prevents thundering herd
- [ ] Retryable operations are idempotent

#### Restart Capability
- [ ] Job is restartable (if required)
- [ ] State persisted correctly
- [ ] `ExecutionContext` used properly
- [ ] No duplicate processing on restart

### 4. Security Review

- [ ] No credentials in code
- [ ] Credentials externalized (env vars/vault)
- [ ] SQL injection prevented (parameterized queries)
- [ ] Input validation prevents malicious data
- [ ] Sensitive data not logged
- [ ] Proper access controls on job execution

### 5. Monitoring & Observability

- [ ] Logging at appropriate levels
- [ ] Metrics exposed (Micrometer)
- [ ] Job execution tracked
- [ ] Alerts configured for failures
- [ ] Dashboard/reporting available

### 6. Documentation Review

- [ ] README with run instructions
- [ ] Configuration documentation
- [ ] Error handling documentation
- [ ] Monitoring/alerting documentation
- [ ] Troubleshooting guide

---

## Optimization Recommendations

### Performance Optimizations
```markdown
| Area | Current | Recommended | Impact |
|------|---------|-------------|--------|
| Chunk Size | {current} | {recommended} | {impact} |
| ... | ... | ... | ... |
```

### Code Improvements
```markdown
1. **{Area}**: {improvement description}
   - Current: {current approach}
   - Recommended: {better approach}
   - Benefit: {why it's better}
```

---

## Final Checklist

### Production Readiness

- [ ] All tests pass
- [ ] Code reviewed
- [ ] Performance benchmarked
- [ ] Security reviewed
- [ ] Documentation complete
- [ ] Monitoring configured
- [ ] Deployment procedure documented
- [ ] Rollback procedure documented

### Handoff Package

Generate final documentation:

```markdown
## {Job Name} - Handoff Documentation

### Overview
{Brief description of what the job does}

### Architecture
{Mermaid diagram of job flow}

### Configuration
{Key configuration parameters and their purposes}

### Running the Job
{Detailed instructions for running}

### Monitoring
{How to monitor job execution}

### Troubleshooting
{Common issues and solutions}

### Maintenance
{Ongoing maintenance requirements}
```

---

## Session Completion

### Summary Template

```markdown
## SBA Session Complete

### Project: {name}

### Artifacts Generated
{count} files across:
- Configuration: {count}
- Data Models: {count}
- Processing Logic: {count}
- Tests: {count}

### Key Decisions
{List of ADRs}

### Technology Stack
- Spring Boot: {version}
- Java: {version}
- Persistence: {jpa/mybatis}
- Database: {type}

### Performance Profile
- Volume: {classification}
- Chunk Size: {size}
- Parallelization: {strategy}

### Next Steps for Team
1. Review generated code
2. Run integration tests
3. Performance test with production-like data
4. Deploy to staging
5. Monitor initial runs
```

---

## Continuous Improvement

### Feedback Collection
- What worked well?
- What could be improved?
- Any patterns to add to skills?

### Skill Updates Needed
If new patterns discovered:
```yaml
skill_update:
  skill: "{skill_name}"
  pattern: "{new_pattern}"
  reason: "{why it's useful}"
```

---

**SESSION COMPLETE**: The Spring Batch job has been designed and implemented. All artifacts are tracked in `sba_state.artifacts`.
