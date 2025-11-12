# Moonshot AI (Kimi) API Setup Guide

This guide walks you through setting up Moonshot AI (Kimi) integration with the SiYuan Claude Assistant plugin.

## Table of Contents

- [Overview](#overview)
- [Getting API Key](#getting-api-key)
- [Model Comparison](#model-comparison)
- [Configuration](#configuration)
- [K2 Thinking Models](#k2-thinking-models)
- [Pricing & Rate Limits](#pricing--rate-limits)
- [Troubleshooting](#troubleshooting)
- [Example Usage](#example-usage)

---

## Overview

**Moonshot AI (月之暗面)** is a Chinese AI company that provides high-quality language models with ultra-long context windows (up to 256K tokens). Their flagship Kimi K2 series models support:

- 🌟 **Ultra-long context**: 256K tokens (K2 0905)
- 🧠 **Reasoning models**: K2 Thinking variants expose internal reasoning process
- ⚡ **OpenAI compatibility**: Drop-in replacement for OpenAI API
- 🌏 **Regional endpoints**: Global and China-specific API endpoints

**Key Advantages:**
- Longer context than GPT-4 Turbo (128K)
- Competitive pricing ($0.15/M input, $2.50/M output for K2 0905)
- Native Chinese language support
- Reasoning transparency (K2 Thinking models)

---

## Getting API Key

### Step 1: Register Account

Visit the Moonshot AI console:
- **Global users**: [https://platform.moonshot.ai/console](https://platform.moonshot.ai/console)
- **China users**: [https://platform.moonshot.cn/console](https://platform.moonshot.cn/console)

**Registration methods:**
- Email + verification code
- WeChat (China region)
- GitHub account (Global region)

### Step 2: Create API Key

1. Navigate to **API Keys** section: [https://platform.moonshot.ai/console/api-keys](https://platform.moonshot.ai/console/api-keys)
2. Click **"Create New API Key"** (创建新密钥)
3. Set a descriptive name (e.g., "SiYuan Plugin")
4. Copy the generated key immediately (shown only once)

**Important**: Store your API key securely. It cannot be retrieved after initial display.

### Step 3: Free Tier Credits

New accounts receive:
- ¥15 free credits
- Valid for 30 days
- Enough for ~100K tokens of K2 0905 usage

For production use, add payment method in **Billing** section.

---

## Model Comparison

### Kimi K2 Series (Latest - 2025)

| Model | Context Window | Strengths | Best For | Pricing |
|-------|---------------|-----------|----------|---------|
| **kimi-k2-0905-preview** | 256K | Latest, most capable | General tasks, long documents | $0.15 / $2.50 per M tokens |
| **kimi-k2-0711-preview** | 128K | Earlier version | Stable baseline | $0.15 / $2.50 per M tokens |
| **kimi-k2-thinking** | 256K | Reasoning transparency | Complex problem-solving | Higher cost (reasoning overhead) |
| **kimi-k2-thinking-turbo** | 256K | Faster reasoning | Quick analysis with reasoning | Optimized speed |

**Recommended**: Use **kimi-k2-0905-preview** for most use cases (best balance of performance and cost).

### Legacy Models (Moonshot V1)

| Model | Context Window | Status | Note |
|-------|---------------|--------|------|
| moonshot-v1-128k | 128K | Deprecated | Use K2 0711 instead |
| moonshot-v1-32k | 32K | Deprecated | Limited context |
| moonshot-v1-8k | 8K | Deprecated | Very limited context |

**Migration**: Legacy users should migrate to K2 series for better performance and features.

---

## Configuration

### Plugin Settings

1. Open **SiYuan Settings** → **Plugins** → **Claude Assistant** → **Settings**
2. In the **Connection** section:
   - **AI Provider**: Select **"🌙 Moonshot AI (Kimi)"**
   - **API Key**: Paste your Moonshot API key
   - **Model**: Choose your desired model (recommended: **kimi-k2-0905-preview**)
   - **Base URL** (optional): Leave default or customize for China region

3. Click **"Test Connection"** to verify setup
4. Save settings

### Base URL Configuration

**Default (Global)**: `https://api.moonshot.ai/v1`
- Best latency for international users
- All models available

**China Region**: `https://api.moonshot.cn/v1`
- Optimized for users in mainland China
- Faster response times within China

**Custom Proxy**: If using a reverse proxy, set your proxy URL here (e.g., `https://your-proxy.com/v1`)

### Temperature Settings

Moonshot limits temperature to **[0, 1]** range (unlike OpenAI's [0, 2]):
- **0.0**: Deterministic, focused responses
- **0.5**: Balanced creativity and coherence (recommended)
- **1.0**: Maximum creativity and variation

The plugin automatically clamps values above 1.0 and logs a warning.

---

## K2 Thinking Models

### What are K2 Thinking Models?

K2 Thinking models expose their **internal reasoning process** before providing the final answer. This is similar to OpenAI's o1 models but with full transparency.

**Example response structure:**
```json
{
  "choices": [{
    "message": {
      "content": "The answer is 42.",
      "reasoning_content": "Let me think step by step:\n1. First, I need to...\n2. Then I consider...\n3. Therefore..."
    }
  }]
}
```

### How the Plugin Handles Reasoning

The plugin automatically formats reasoning content in a **collapsible section**:

```markdown
The answer is 42.

<details>
<summary>🤔 推理过程 (Reasoning Process)</summary>

Let me think step by step:
1. First, I need to...
2. Then I consider...
3. Therefore...
</details>
```

Users can expand the reasoning section to see the model's thought process.

### When to Use K2 Thinking

**Best for:**
- Complex problem-solving (math, logic puzzles)
- Code debugging and optimization
- Multi-step reasoning tasks
- Situations where you need to verify the model's logic

**Not ideal for:**
- Simple queries (adds latency and cost)
- Creative writing (reasoning overhead unnecessary)
- Batch processing (slower throughput)

**Performance note**: K2 Thinking models take 2-5x longer to respond due to reasoning computation.

---

## Pricing & Rate Limits

### Pricing (as of 2025-01)

**K2 0905/0711 Models:**
- **Input**: $0.15 per million tokens
- **Output**: $2.50 per million tokens

**K2 Thinking Models:**
- **Input**: $0.15 per million tokens
- **Output**: Higher cost due to reasoning tokens (check current pricing on platform)

**Comparison with competitors:**
- **GPT-4 Turbo**: $10 / $30 per M tokens (20x more expensive)
- **Claude 3.5 Sonnet**: $3 / $15 per M tokens (6x more expensive)
- **Gemini 1.5 Pro**: $1.25 / $5 per M tokens (comparable)

### Rate Limits

**Free Tier:**
- 6 requests per minute (RPM)
- 100,000 tokens per minute (TPM)

**Paid Tier:**
- 60 RPM (10x higher)
- 1,000,000 TPM
- Custom enterprise limits available

**429 Error Handling:**
The plugin automatically detects rate limit errors and displays:
```
Moonshot API rate limit exceeded. Please try again later or upgrade your plan.
```

**Solution**: Wait 60 seconds or upgrade to paid tier for higher limits.

---

## Troubleshooting

### Issue 1: "API Key Invalid"

**Symptoms:**
- 401 Unauthorized error
- "Invalid API key" message

**Solutions:**
1. Verify API key copied correctly (no extra spaces)
2. Check if key is activated in console
3. Ensure key hasn't expired (regenerate if needed)
4. Try global endpoint if using China endpoint (or vice versa)

### Issue 2: "Connection Timeout"

**Symptoms:**
- Request hangs for 10+ seconds
- "Network error" message

**Solutions:**
1. Check internet connection
2. Try alternative Base URL (switch between global/China endpoints)
3. If behind firewall, use reverse proxy
4. Verify Moonshot service status: [status.moonshot.ai](https://status.moonshot.ai)

### Issue 3: "Model Not Found"

**Symptoms:**
- 404 error when using specific model
- "Model does not exist" message

**Solutions:**
1. Verify model name spelling (case-sensitive)
2. Check if model is available for your account tier
3. Use recommended models from dropdown (auto-populated)
4. Legacy models may require migration to K2 series

### Issue 4: "Rate Limit Exceeded"

**Symptoms:**
- 429 error
- Requests blocked after 6 requests

**Solutions:**
1. Wait 60 seconds for rate limit reset
2. Upgrade to paid tier for 10x higher limits
3. Implement request queuing in your application
4. Use K2 Thinking Turbo instead of K2 Thinking (faster)

### Issue 5: "Temperature Clamped"

**Symptoms:**
- Console warning: "Temperature X clamped to 1.0"

**Explanation:**
Moonshot limits temperature to [0, 1] range. The plugin automatically clamps values:
- Input: `temperature: 1.5`
- Actual: `temperature: 1.0`

**No action needed** - this is expected behavior for compatibility with OpenAI-style settings.

---

## Example Usage

### Basic Chat Query

**Settings:**
- Provider: Moonshot AI (Kimi)
- Model: kimi-k2-0905-preview
- Temperature: 0.7

**Prompt:**
```
请用中文总结《三体》这本小说的主要内容
```

**Expected Response:**
```
《三体》是刘慈欣创作的科幻小说三部曲，主要讲述了地球文明与三体文明之间的博弈...
[Detailed summary in Chinese]
```

### Long Context Analysis

**Use Case:** Analyze a 50-page document

**Settings:**
- Model: kimi-k2-0905-preview (256K context)
- Temperature: 0.5

**Workflow:**
1. Paste entire document into chat (up to ~200K Chinese characters)
2. Ask analysis questions:
   - "这份报告的核心观点是什么？"
   - "请列出文中提到的所有数据来源"
   - "对比第3章和第7章的论点"

**Advantage:** No need to chunk document - entire context fits in one request.

### K2 Thinking Problem Solving

**Use Case:** Debug complex code

**Settings:**
- Model: kimi-k2-thinking
- Temperature: 0.3 (more focused reasoning)

**Prompt:**
```python
def binary_search(arr, target):
    left, right = 0, len(arr)
    while left < right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid
        else:
            right = mid
    return -1

# This function has a bug. Find and fix it.
```

**Expected Response:**
```
The bug is in the condition update...

<details>
<summary>🤔 推理过程 (Reasoning Process)</summary>

Let me analyze this step by step:

1. First, I'll trace through an example input: arr=[1,3,5,7,9], target=5
2. Initial state: left=0, right=5
3. First iteration: mid=2, arr[2]=5 (match!)
   - But wait, there's a problem in the else branch...
4. The bug is: `left = mid` should be `left = mid + 1`
   - Otherwise we get infinite loop when target not found
5. Similarly, `right = mid` is correct (maintains invariant)

Therefore, the fix is...
</details>
```

### Quick Edit with Kimi

**Use Case:** Improve writing in SiYuan document

**Workflow:**
1. Select text in SiYuan editor
2. Right-click → Quick Edit → "Polish Writing"
3. Plugin sends to Kimi K2 0905
4. Review AI suggestion side-by-side
5. Accept or reject changes

**Template example:**
```markdown
systemPrompt: 你是一位专业的中文写作顾问
editInstruction: |
  请改进以下文字，使其更加简洁流畅：

  {original}

  要求：
  - 保持原意不变
  - 删除冗余表达
  - 优化句子结构
```

---

## Advanced Configuration

### Context Window Optimization

For maximum context usage:

```typescript
// Plugin settings
{
  "maxTokens": 4096,  // Output limit
  "temperature": 0.5,
  "model": "kimi-k2-0905-preview"  // 256K context
}
```

**Effective context** = 256K (total) - 4K (output) = ~252K tokens for input

**Estimation:** 1 token ≈ 1.5 Chinese characters or 0.75 English words

### Streaming Configuration

Enable streaming for real-time responses:

```typescript
// Automatically enabled in plugin
streamMessage(messages, {
  onChunk: (chunk) => {
    // Update UI incrementally
  },
  onComplete: () => {
    // Finalize display
  }
})
```

### Multi-Turn Conversations

The plugin maintains conversation history automatically:

```typescript
// Handled internally by UniversalAIClient
messages: [
  { role: 'user', content: 'What is the capital of France?' },
  { role: 'assistant', content: 'Paris.' },
  { role: 'user', content: 'What about Germany?' }
]
```

**Context management:** Plugin truncates old messages if total exceeds context window.

---

## Best Practices

### 1. Model Selection

- **General tasks**: kimi-k2-0905-preview (best value)
- **Long documents**: kimi-k2-0905-preview (256K context)
- **Reasoning tasks**: kimi-k2-thinking (transparency)
- **Speed priority**: kimi-k2-thinking-turbo (faster reasoning)

### 2. Temperature Tuning

- **Translation/Summarization**: 0.3-0.5 (precise)
- **Creative writing**: 0.7-1.0 (varied)
- **Code generation**: 0.2-0.4 (deterministic)
- **Brainstorming**: 0.8-1.0 (diverse)

### 3. Cost Optimization

- Use **K2 0905** instead of Thinking models when reasoning transparency not needed
- Truncate old conversation history to reduce input tokens
- Cache frequently used context (documents, code) instead of re-sending

### 4. Performance Tips

- Enable **streaming** for better user experience
- Use **China endpoint** if in mainland China (lower latency)
- Set **appropriate timeouts** for K2 Thinking models (allow 30-60s)

---

## Resources

- **Official Documentation**: [https://platform.moonshot.ai/docs](https://platform.moonshot.ai/docs)
- **API Reference**: [https://platform.moonshot.ai/docs/api-reference](https://platform.moonshot.ai/docs/api-reference)
- **Model Comparison**: [https://platform.moonshot.ai/docs/intro](https://platform.moonshot.ai/docs/intro)
- **Pricing Page**: [https://platform.moonshot.ai/pricing](https://platform.moonshot.ai/pricing)
- **Status Page**: [https://status.moonshot.ai](https://status.moonshot.ai)

---

## Support

For issues specific to Moonshot AI:
- **Email**: support@moonshot.ai
- **WeChat**: Search "月之暗面" official account

For plugin-related issues:
- **GitHub Issues**: [siyuan-plugin-claude-assistant/issues](https://github.com/your-repo/issues)
- **SiYuan Forum**: Post in plugin discussion section

---

**Last Updated**: 2025-01-12
**Plugin Version**: 0.10.1
**Moonshot API Version**: v1
