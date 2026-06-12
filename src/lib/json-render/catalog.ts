import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["row", "column"]).optional(),
        gap: z.number().optional(),
      }),
      slots: ["default"],
      description: "Flex layout container",
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
      }),
      slots: ["default"],
      description: "Card container",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h1", "h2", "h3", "h4"]).optional(),
      }),
      description: "Heading text",
    },
    Text: {
      props: z.object({
        text: z.string(),
      }),
      description: "Paragraph text",
    },
    Input: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        placeholder: z.string().optional(),
        value: z.string().optional(),
        type: z.enum(["text", "email", "password", "number", "url"]).optional(),
      }),
      description: "Text input field",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "outline"]).optional(),
        size: z.enum(["sm", "md", "lg"]).optional(),
      }),
      description: "Clickable button",
    },
    Select: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        options: z.array(z.object({ label: z.string(), value: z.string() })),
        placeholder: z.string().optional(),
        value: z.string().optional(),
      }),
      description: "Dropdown select",
    },
    Switch: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        checked: z.boolean().optional(),
      }),
      description: "Toggle switch",
    },
    Separator: {
      props: z.object({}),
      description: "Visual divider line",
    },
    List: {
      props: z.object({
        ordered: z.boolean().optional(),
        items: z.array(z.string()).optional(),
      }),
      slots: ["default"],
      description: "Ordered or unordered list",
    },
    ListItem: {
      props: z.object({
        text: z.string().optional(),
      }),
      slots: ["default"],
      description: "Single list item",
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        fit: z.enum(["cover", "contain", "fill"]).optional(),
      }),
      description: "Image display",
    },
    CodeBlock: {
      props: z.object({
        code: z.string(),
        language: z.string().optional(),
        showLineNumbers: z.boolean().optional(),
      }),
      description: "Syntax-highlighted code block",
    },
    Markdown: {
      props: z.object({
        content: z.string(),
      }),
      description: "Markdown content renderer",
    },
    Link: {
      props: z.object({
        href: z.string(),
        text: z.string(),
        target: z.enum(["_self", "_blank"]).optional(),
      }),
      description: "Hyperlink",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        color: z.enum(["gray", "green", "red", "yellow", "blue", "purple"]).optional(),
        size: z.enum(["sm", "md"]).optional(),
      }),
      description: "Small status badge or tag",
    },
    Table: {
      props: z.object({
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), z.any())),
        striped: z.boolean().optional(),
      }),
      description: "Data table",
    },
    DatePicker: {
      props: z.object({
        label: z.string(),
        name: z.string(),
        value: z.string().optional(),
        min: z.string().optional(),
        max: z.string().optional(),
        placeholder: z.string().optional(),
      }),
      description: "Date picker input",
    },
    FloatSprite: {
      props: z.object({
        src: z.string(),
        width: z.number().optional(),
        alt: z.string().optional(),
        floatRange: z.number().optional(),
        reminderInterval: z.number().optional(),
        reminderMessages: z.array(z.string()).optional(),
        followMouse: z.boolean().optional(),
        followSpeed: z.number().optional(),
        throwEnabled: z.boolean().optional(),
      }),
      description: "⭐ Draggable floating sprite (desk pet). Use absolute path for local PNG. Supports timed reminder bubbles.",
    },
  },
  actions: {
    submit: {
      params: z.object({ formId: z.string().optional() }),
      description: "Submit form",
    },
    reset: {
      params: z.object({}),
      description: "Reset form",
    },
  },
});
