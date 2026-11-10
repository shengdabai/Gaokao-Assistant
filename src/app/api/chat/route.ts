import { executeToolCall } from "@/lib/chatTools";
import OpenAI from "openai";

// Provider configurations - all OpenAI-compatible
const PROVIDERS: Record<string, { baseURL: string; defaultModel: string; models: string[] }> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  claude: {
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-20250514"],
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash-preview-05-20",
    models: ["gemini-2.5-flash-preview-05-20", "gemini-2.5-pro-preview-05-06", "gemini-2.0-flash"],
  },
  kimi: {
    baseURL: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-auto",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "moonshot-v1-auto"],
  },
  glm: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-long", "glm-4"],
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
    models: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "google/gemini-2.5-flash-preview-05-20", "deepseek/deepseek-chat-v3"],
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
};

// Export for client-side use
export const PROVIDER_LIST = Object.entries(PROVIDERS).map(([id, cfg]) => ({
  id,
  name: { openai: "OpenAI GPT", claude: "Claude", gemini: "Gemini", kimi: "Kimi (月之暗面)", glm: "智谱 GLM", openrouter: "OpenRouter", deepseek: "DeepSeek" }[id] || id,
  models: cfg.models,
  defaultModel: cfg.defaultModel,
}));

const SYSTEM_PROMPT = `你是"青海高考报考教练"，专业友好的高考志愿填报助手。帮助青海省考生和家长从1342所院校中精准选择。

## 核心能力
1. **精准筛选**：按城市、科目、批次、专业、学费、招生类型等多维度筛选
2. **学校详情**：查看任意学校的完整信息，包括全部招生专业+宿舍/食堂/校园口碑
3. **学校对比**：多校并排对比（专业数/计划数/学费/口碑）
4. **数据统计**：按城市/专业/批次/学费的分布分析
5. **宿舍排名**：按宿舍设施质量排名，支持区域筛选

## 数据说明
- 数据来源：2025年青海省招生计划（13764条记录）
- 口碑来源：colleges.chat 学生真实反馈（1045所学校有宿舍/食堂/校园数据）
- 学校标识：laosheng.top 985/211/双一流标识
- ⚠️ 本数据为招生计划数据，**不含历年录取分数线**。如用户问分数线，明确告知数据不含分数线，建议查阅青海省教育考试院官网

## 工具使用规则（极重要）
1. **任何涉及数据的问题都必须调用工具**，绝不凭记忆回答
2. **用户问某个学校** → 调用 get_school_info，返回完整专业列表+口碑
3. **用户问某类学校/专业** → 调用 search_programs，返回所有匹配的学校和专业
4. **用户问对比** → 调用 compare_schools
5. **用户问统计/分布** → 调用 get_statistics
6. **用户问宿舍条件/排名** → 调用 rank_by_dorm_quality
7. search_programs 返回按学校分组的结果，展示时列出每个学校及其匹配的专业
8. get_school_info 返回解析后的口碑摘要（宿舍/食堂/交通/学生评价），直接引用展示
9. 支持地区别名：江浙沪、长三角、珠三角、京津冀、东北、西北、西南、华中、华东、华南、华北
10. 支持按学校性质筛选：school_type 参数可传"民办"或"公办"
11. 用户提到"南方"时，搜索华东+华南+西南地区；"北方"时搜索华北+东北+西北
12. 如果搜索结果为空，说明该学校/条件在2025年青海招生计划中没有记录，建议用户换个关键词或放宽条件
13. 用户问的学校如果不在数据库中，明确告知"该校2025年未在青海招生"，而非说"名称有误"
14. 当用户问某个具体专业时，除了展示招生数据和口碑，还要补充该校官网上该专业的培养方案链接和重点课程概括。格式：先给出官网链接（通常为 学校域名/院系/专业），再用1-2句话概括核心课程方向。如果不确定具体URL，给出学校官网首页让用户自行查找

## 回答格式
1. 数字信息直接展示原始数据，绝不改述（"计划人数：5人"不说"约5名"）
2. 搜索结果按学校分组展示，每个学校列出：名称、城市、985/211标识、匹配的专业列表
3. 学校详情必须包含口碑信息（如果有）：宿舍条件、食堂情况、交通、学生评价
4. 每次展示完数据后，主动问用户是否需要查看某个学校的详细信息或口碑
5. 主动提醒青海特色：藏文班、民族班、预科等特殊类型
6. 用表格或列表展示结构化数据，保持简洁有条理
7. 每次回答后，在回答末尾用 \`---SUGGESTIONS---\` 分隔，然后给出2-3个追问建议，每行一个，用 \`- \` 开头。追问建议应该与当前话题相关，帮助用户深入了解`;

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_programs",
      description:
        "搜索招生计划。可按城市、科目(物理/历史)、批次(本科批/本科提前批/专科批/专科提前批)、专业关键词、学校关键词、学费范围、招生类型(藏文班/预科/军事类/民族班等)等条件筛选。支持地区别名如江浙沪、长三角、京津冀等。",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市、省份或地区别名，如'上海'、'江浙沪'、'长三角'" },
          subject: { type: "string", description: "科目方向：'物理' 或 '历史'" },
          batch: { type: "string", description: "批次：本科批、本科提前批、专科批、专科提前批" },
          major_category: { type: "string", description: "专业大类，如'计算机类'、'法学类'、'医学类'" },
          major_keyword: { type: "string", description: "专业名称关键词，如'计算机'、'会计'" },
          school_keyword: { type: "string", description: "学校名称关键词，如'交通大学'、'师范'" },
          tuition_max: { type: "number", description: "最高学费（元/年）" },
          tuition_min: { type: "number", description: "最低学费（元/年）" },
          type: { type: "string", description: "招生类型：藏文班、预科、军事类、民族班、蒙文班等" },
          school_type: { type: "string", description: "学校性质：民办 或 公办" },
          limit: { type: "number", description: "返回结果数量上限，默认100" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_school_info",
      description: "获取某所学校的详细信息，包括所有在青海招生的专业列表和口碑（宿舍/食堂/交通/学生评价）",
      parameters: {
        type: "object",
        properties: {
          school_name: { type: "string", description: "学校名称或关键词" },
        },
        required: ["school_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_schools",
      description: "对比多所学校的信息（专业数量、招生计划、学费范围、宿舍口碑等）",
      parameters: {
        type: "object",
        properties: {
          school_names: {
            type: "array",
            items: { type: "string" },
            description: "要对比的学校名称列表（2-5所）",
          },
        },
        required: ["school_names"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_statistics",
      description: "获取统计数据。维度可选：city(按城市)、major_category(按专业大类)、batch(按批次)、tuition(按学费)、overview(总览)",
      parameters: {
        type: "object",
        properties: {
          dimension: {
            type: "string",
            enum: ["city", "major_category", "batch", "tuition", "overview"],
            description: "统计维度",
          },
        },
        required: ["dimension"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rank_by_dorm_quality",
      description: "按宿舍条件质量排名学校。根据空调、独立卫生间、热水、上床下桌、洗衣机等设施评分排序。支持地区别名（江浙沪、长三角、珠三角、京津冀等）。",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "地区关键词或区域别名，如'江浙沪'、'北京'、'长三角'" },
          limit: { type: "number", description: "返回学校数量，默认10" },
        },
        required: [],
      },
    },
  },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function GET() {
  return Response.json({ providers: PROVIDER_LIST });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let originHost;
  try {
    originHost = origin ? new URL(origin).host : undefined;
  } catch {
    return Response.json({ error: "不允许跨站请求" }, { status: 403 });
  }
  // Next.js may construct an internal URL; Host retains the browser-facing host.
  const host = request.headers.get("host") || new URL(request.url).host;
  if ((origin && originHost !== host) || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "不允许跨站请求" }, { status: 403 });
  }

  // Bound actual bytes read, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let body;
  try {
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return Response.json({ error: "请求过大" }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ error: "请求格式无效" }, { status: 400 });
  }

  try {
    if (!body || !Array.isArray(body.messages) || !body.messages.length ||
      body.messages.some((m: unknown) => !m || typeof m !== "object" ||
        !("role" in m) || typeof m.role !== "string" || !["user", "assistant"].includes(m.role) ||
        !("content" in m) || typeof m.content !== "string") ||
      (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 4096)) ||
      (body.model !== undefined && (typeof body.model !== "string" || body.model.length > 200))) {
      return Response.json({ error: "请求格式无效" }, { status: 400 });
    }

    // Get provider config from request
    const providerKey = body.provider ?? "glm";
    if (typeof providerKey !== "string" || !Object.hasOwn(PROVIDERS, providerKey)) {
      return Response.json({ error: "不支持的模型提供商" }, { status: 400 });
    }
    const providerConfig = PROVIDERS[providerKey];

    const model = body.model || providerConfig.defaultModel;

    // The server-side GLM key may only be used for GLM itself and only with a
    // configured GLM model; every other provider requires the caller's own key,
    // so the server key is never sent to a third-party host.
    const clientApiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    let apiKey = clientApiKey;
    if (!apiKey && providerKey === "glm") {
      if (!providerConfig.models.includes(model)) {
        return Response.json({ error: `不支持的模型: ${model}` }, { status: 400 });
      }
      apiKey = process.env.GLM_API_KEY || "";
    }
    if (!apiKey) {
      return Response.json({ error: "请先在设置中配置 API Key" }, { status: 400 });
    }

    // Create client dynamically
    const client = new OpenAI({
      apiKey,
      baseURL: providerConfig.baseURL,
      timeout: 60_000,
      maxRetries: 0,
    });

    const MAX_MESSAGES = 50;
    const MAX_CONTENT_LENGTH = 4000;

    const messages: ChatMessage[] = body.messages.slice(-MAX_MESSAGES).map((m: Record<string, unknown>) => ({
      role: m.role as ChatMessage["role"],
      content: (m.content as string).slice(0, MAX_CONTENT_LENGTH),
    }));

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    let response = await client.chat.completions.create({
      model,
      messages: openaiMessages,
      tools,
      tool_choice: "auto",
    }, { signal: request.signal });

    let choice = response.choices[0];

    let iterations = 0;
    while (choice.finish_reason === "tool_calls" && choice.message.tool_calls && iterations < 5) {
      iterations++;
      openaiMessages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== "function") continue;
        const fn = toolCall.function;

        let args: unknown;
        try {
          args = JSON.parse(fn.arguments);
        } catch {
          // Suppress tool name from logs to avoid internal detail leakage
          console.warn("Invalid tool arguments received");
        }

        const result = executeToolCall(fn.name, args);

        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result, null, 2),
        });
      }

      response = await client.chat.completions.create({
        model,
        messages: openaiMessages,
        tools,
        tool_choice: "auto",
      }, { signal: request.signal });

      choice = response.choices[0];
    }

    const assistantMessage = choice.message.content || "抱歉，我没有理解您的问题，请再试一次。";

    return Response.json({ message: assistantMessage });
  } catch (error) {
    // Upstream errors can contain credentials, request headers and user content.
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error("Chat API error", { status: status ?? "unexpected" });
    if (status === 401 || status === 403) {
      return Response.json({ error: "API Key 无效或已过期，请在设置中检查" }, { status: 401 });
    }
    if (status === 429) {
      return Response.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
    }
    return Response.json({ error: "服务暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
