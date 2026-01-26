# Phase 1: Discovery

**Goal**: Understand requirements, constraints, and scope before making any technical decisions.

**Token Budget**: ~4k tokens (this file + state-schema reference)

---

## Entry Checklist

- [ ] State initialized with `current_phase: 1`
- [ ] Greeted user and explained process
- [ ] Checked for existing Spring Batch code in project

## Discovery Questions

Ask these questions systematically. Don't overwhelm - group into logical sets.

### Set 1: Project Overview
1. **What is this batch job for?** (Brief description)
2. **What type of processing?**
   - ETL (Extract-Transform-Load)
   - Data Migration
   - Data Synchronization
   - Report Generation
   - Custom Processing

### Set 2: Data Sources
3. **Where does the data come from?**
   - Database (which type?)
   - File (CSV, JSON, XML, Fixed-width?)
   - API/Web Service
   - Message Queue
   - Multiple sources?

4. **What's the data volume?**
   - Small: < 10,000 records
   - Medium: 10,000 - 1,000,000 records
   - Large: 1M - 100M records
   - Enterprise: > 100M records

### Set 3: Data Targets
5. **Where does the data go?**
   - Database (same or different?)
   - File output
   - API calls
   - Message publishing

6. **What transformations are needed?**
   - Field mapping
   - Data validation
   - Enrichment
   - Aggregation
   - Filtering

### Set 4: Requirements & Constraints
7. **Performance requirements?**
   - Processing time window
   - Throughput needs
   - Concurrent job limitations

8. **Error handling needs?**
   - Skip invalid records?
   - Retry on failures?
   - Stop on first error?
   - Manual intervention required?

9. **Scheduling requirements?**
   - Frequency (daily, hourly, on-demand)
   - Dependencies on other jobs
   - Triggered by events?

10. **Any existing code or patterns to follow?**
    - Existing batch jobs to reference
    - Company coding standards
    - Required frameworks/libraries

## Information Gathering Techniques

### If existing codebase:
```
1. Glob for existing batch configs: **/*BatchConfig*.java, **/*Job*.java
2. Check pom.xml/build.gradle for Spring Batch dependencies
3. Look for application.yml batch configurations
4. Review existing ItemReader/Writer/Processor implementations
```

### If greenfield project:
```
1. Ask about preferred tech stack
2. Check for database schemas/DDL files
3. Review any specification documents
4. Understand integration points
```

## State Population Template

After gathering information, update state:

```yaml
sba_state:
  current_phase: 1
  project_context:
    name: "{job_name}"
    type: "{etl|migration|sync|report|custom}"
    volume: "{small|medium|large|enterprise}"
    description: "{brief_description}"
    business_requirements:
      - "{requirement_1}"
      - "{requirement_2}"
    constraints:
      - "{constraint_1}"
  sources:
    - type: "{database|file|api|message-queue}"
      location: "{connection/path}"
      format: "{format}"
      volume_estimate: "{count}"
  targets:
    - type: "{database|file|api|message-queue}"
      location: "{connection/path}"
      format: "{format}"
```

## Discovery Summary Template

Present findings to user:

```markdown
## Discovery Summary

### Project: {name}
**Type**: {type} | **Volume**: {volume}

### Data Flow
```
{source_description} → [Batch Job] → {target_description}
```

### Key Requirements
1. {requirement_1}
2. {requirement_2}

### Constraints
- {constraint_1}
- {constraint_2}

### Next Steps
Ready to proceed to Phase 2: Architecture where we'll decide on:
- Processing pattern (chunk vs tasklet)
- Parallelization strategy
- Technology choices (persistence, database)
```

## Transition Criteria

**Ready for Phase 2 when:**
- [ ] Project type identified
- [ ] Volume classification determined
- [ ] At least one source defined
- [ ] At least one target defined
- [ ] Key requirements documented
- [ ] User confirms understanding is correct

## Transition Command

```
sba_state.current_phase = 2
→ Read {{AGENT_DIR}}/sba/phases/2-architecture.md
```

---

**IMPORTANT**: Do not make technology decisions in this phase. Focus purely on understanding the problem domain.
