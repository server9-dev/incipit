import type { Template } from "./types.js";

/**
 * Starter template gallery. Adding a template is pure data — drop a new
 * object in here (or load from disk later) and it shows up in the UI.
 */
export const templates: Template[] = [
  {
    id: "blog-post",
    name: "Blog Post",
    description: "Draft a full blog post from a topic and a few key points.",
    category: "Content",
    icon: "newspaper",
    fields: [
      { id: "topic", label: "Topic", type: "text", required: true, placeholder: "e.g. Local-first software" },
      { id: "points", label: "Key points", type: "textarea", required: false, placeholder: "One per line" },
      { id: "tone", label: "Tone", type: "select", required: false, options: ["Neutral", "Casual", "Professional", "Persuasive", "Witty"] },
    ],
    system: "You are an expert blog writer. Write clear, well-structured posts with a strong hook, scannable sections, and a concise conclusion. Use Markdown headings.",
    prompt: "Write a blog post about: {{topic}}\n\nKey points to cover (if any):\n{{points}}\n\nTone: {{tone}}",
  },
  {
    id: "email",
    name: "Email",
    description: "Compose a professional email for any situation.",
    category: "Business",
    icon: "mail",
    fields: [
      { id: "purpose", label: "What's the email about?", type: "textarea", required: true, placeholder: "e.g. Following up after a meeting" },
      { id: "recipient", label: "Recipient", type: "text", required: false, placeholder: "e.g. a potential client" },
      { id: "tone", label: "Tone", type: "select", required: false, options: ["Professional", "Friendly", "Formal", "Direct"] },
    ],
    system: "You write effective emails: clear subject line, appropriate greeting, a focused body, and a clear call to action. Keep it concise.",
    prompt: "Write an email.\nPurpose: {{purpose}}\nRecipient: {{recipient}}\nTone: {{tone}}",
  },
  {
    id: "seo-article",
    name: "SEO Article",
    description: "Long-form, keyword-optimized article outline + draft.",
    category: "Content",
    icon: "search",
    fields: [
      { id: "keyword", label: "Primary keyword", type: "text", required: true },
      { id: "audience", label: "Target audience", type: "text", required: false },
    ],
    system: "You are an SEO content strategist. Produce content that reads naturally for humans while covering the topic comprehensively. Use H2/H3 structure and include a meta description.",
    prompt: "Write an SEO article targeting the keyword: {{keyword}}\nAudience: {{audience}}\nStart with a one-line meta description, then the article in Markdown.",
  },
  {
    id: "social-caption",
    name: "Social Caption",
    description: "Punchy captions for Instagram, X, or LinkedIn.",
    category: "Social",
    icon: "hash",
    fields: [
      { id: "subject", label: "What are you posting about?", type: "textarea", required: true },
      { id: "platform", label: "Platform", type: "select", required: true, options: ["Instagram", "X / Twitter", "LinkedIn", "TikTok"] },
    ],
    system: "You are a social media copywriter. Match the platform's voice and length conventions. Offer 3 caption options.",
    prompt: "Write 3 {{platform}} caption options about: {{subject}}",
  },
  {
    id: "youtube-script",
    name: "YouTube Script",
    description: "Hook, body, and outro for a video script.",
    category: "Social",
    icon: "video",
    fields: [
      { id: "topic", label: "Video topic", type: "text", required: true },
      { id: "length", label: "Target length", type: "select", required: false, options: ["Short (<1 min)", "Standard (5-8 min)", "Long (15+ min)"] },
    ],
    system: "You write engaging YouTube scripts with a strong 5-second hook, a clear structure, and a call to subscribe at the end.",
    prompt: "Write a YouTube script.\nTopic: {{topic}}\nLength: {{length}}",
  },
  {
    id: "resume-bullet",
    name: "Resume Bullets",
    description: "Turn a role description into impact-driven bullets.",
    category: "Career",
    icon: "briefcase",
    fields: [
      { id: "role", label: "Role / responsibilities", type: "textarea", required: true },
    ],
    system: "You are a resume expert. Write concise, quantified, action-verb-led bullet points that emphasize impact.",
    prompt: "Turn the following into 4-6 strong resume bullet points:\n{{role}}",
  },
  {
    id: "essay",
    name: "Essay",
    description: "Structured academic-style essay on a prompt.",
    category: "Academic",
    icon: "graduation-cap",
    fields: [
      { id: "prompt", label: "Essay prompt", type: "textarea", required: true },
      { id: "words", label: "Approx. word count", type: "text", required: false, placeholder: "e.g. 800" },
    ],
    system: "You are an academic writer. Produce a clear thesis, structured argument with topic sentences, evidence, and a conclusion. Avoid fabricated citations.",
    prompt: "Write an essay responding to:\n{{prompt}}\nApprox length: {{words}} words.",
  },
  {
    id: "product-description",
    name: "Product Description",
    description: "Benefit-focused copy for a product listing.",
    category: "Marketing",
    icon: "tag",
    fields: [
      { id: "product", label: "Product", type: "text", required: true },
      { id: "features", label: "Key features", type: "textarea", required: false },
    ],
    system: "You write conversion-focused e-commerce copy. Lead with benefits, keep it scannable, end with a subtle nudge to buy.",
    prompt: "Write a product description.\nProduct: {{product}}\nFeatures:\n{{features}}",
  },
  {
    id: "summary",
    name: "Summarize Text",
    description: "Condense pasted text into key points.",
    category: "Utility",
    icon: "list",
    fields: [
      { id: "text", label: "Text to summarize", type: "textarea", required: true },
    ],
    system: "You summarize faithfully without adding information. Produce a 2-3 sentence abstract followed by bullet-point key takeaways.",
    prompt: "Summarize the following:\n{{text}}",
  },
  {
    id: "freeform",
    name: "Freeform Prompt",
    description: "Just describe what you want written.",
    category: "Utility",
    icon: "sparkles",
    fields: [
      { id: "instruction", label: "What do you want written?", type: "textarea", required: true },
    ],
    system: "You are a versatile, high-quality writing assistant.",
    prompt: "{{instruction}}",
  },
];

export function getTemplate(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

/** Substitute {{field_id}} placeholders in a template's prompt. */
export function renderPrompt(template: Template, values: Record<string, string>): string {
  return template.prompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]?.trim() || "");
}
