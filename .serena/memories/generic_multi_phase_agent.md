# Generic Multi-Phase Agent Implementation (Final)

## Overview
Created a generic, class-based multi-phase agent module (`multi-phase-agent.ts`) with a single factory export function `createMultiPhaseAgent()`.

## Architecture

### Main Export: Factory Function
```typescript
function createMultiPhaseAgent<TContext = unknown>(
  options?: MultiPhaseAgentOptions
): MultiPhaseAgent<TContext>
```

Single entry point that creates and returns agent instances. Supports full TypeScript generics for context types.

### Class Structure: MultiPhaseAgent
- **Private client**: GoogleGenAI instance
- **Private options**: MultiPhaseAgentOptions
- **Private methods**:
  - `debug(message)` - Logging with context ID prefix
  - `chatWithTools(messages, tools, generationConfig)` - MCP tool integration
  - `executePhase(phase, context)` - Single phase execution
- **Public method**: `async run(phases, initialContext)` - Main execution method

## Key Features

### Phase Structure
Each phase includes:
- `id: string` - Unique identifier
- `description?: string` - Optional description
- `messages: AgentMessage[]` - System and user messages
- `tools?: FunctionDeclaration[]` - MCP tools
- `outputParser?: (output, context) => unknown` - Optional parser
- `generationConfig?: GenerationConfig` - Gemini settings

### Generation Configuration
Full Gemini API parameter support:
- `maxOutputTokens` - Output limit
- `temperature` - Diversity (0-2)
- `topP`, `topK` - Sampling
- `seed` - Reproducibility
- `stopSequences` - Early stopping
- `presencePenalty`, `frequencyPenalty` - Repetition control
- `thinkingConfig.thinkingBudget` - Thinking tokens (Gemini 2.5)

### Options & Callbacks
- `contextId` - ID for logging
- `maxIterations` - Tool call limit (default: 20)
- `onDebug` - Debug callback
- `onPhaseStart` - Phase start callback
- `onPhaseComplete` - Phase completion callback

## File Location
`/src/configs/trpc/routes/escape-from-seoul/_lib/multi-phase-agent.ts`

## Exports
- **Function**: `createMultiPhaseAgent`
- **Types**: `AgentMessage`, `GenerationConfig`, `Phase`, `PhaseExecutionResult`, `MultiPhaseAgentOptions`
- **Utilities**: `extractJsonFromMarkdown`, `normalizeToolResponse`, `buildGenerationConfig`

## Usage Example

```typescript
// Create agent with options
const agent = createMultiPhaseAgent({
  contextId: 'novel-writing-001',
  maxIterations: 30,
  onPhaseStart: (id, desc) => console.log(`▶️ ${desc}`),
  onPhaseComplete: (result) => console.log(`✅ ${result.phaseId}`)
});

// Define phases
const phases: Phase[] = [
  {
    id: 'planning',
    description: '계획 단계',
    messages: [
      { role: 'system', content: 'You are a planner' },
      { role: 'user', content: 'Plan the next chapter...' }
    ],
    tools: [/* MCP tools */],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
  },
  {
    id: 'writing',
    description: '작성 단계',
    messages: [
      { role: 'system', content: 'You are a writer' },
      { role: 'user', content: 'Write the chapter...' }
    ],
    tools: [/* MCP tools */],
    outputParser: (output) => JSON.parse(extractJsonFromMarkdown(output))
  }
];

// Run agent
const results = await agent.run(phases, {});

// Process results
results.forEach(result => {
  console.log(`Phase: ${result.phaseId}, Success: ${result.success}`);
  if (result.parsedOutput) {
    console.log('Parsed:', result.parsedOutput);
  }
});
```

## Benefits

1. **Single Export** - One factory function for simplicity
2. **Type-Safe** - Full TypeScript generic support
3. **Encapsulation** - Private methods, clean API
4. **Flexible** - Custom output parsers per phase
5. **Observable** - Callback hooks for monitoring
6. **Reusable** - Works for any AI task, not just novels
7. **Well-Documented** - Comprehensive JSDoc in Korean

## Documentation
All public APIs and types have detailed Korean JSDoc comments with parameter descriptions, return types, and usage examples.
