/**
 * create_anime_sprite —— 从本地 PNG 创建一个可拖拽漂浮的二次元桌宠
 *
 * 必须传入绝对路径。工具会：
 * 1. 校验文件存在 + 是否为 PNG
 * 2. 在 agent-backend/specs/ 下生成 UI spec JSON（含 FloatSprite 组件）
 * 3. 前端自动通过 SSE 热加载
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { SPECS_DIR, sanitizeName } from './utils.js';
import { notifySpecChanged } from './events.js';

export const createAnimeSpriteTool = tool(
  ({ image_path, name, width, floatRange, x, y, reminderInterval, reminderMessages, followMouse, followSpeed, throwEnabled }) => {
    // 1. 校验文件
    if (!image_path || !image_path.trim()) {
      return { success: false, error: 'image_path 不能为空，必须传绝对路径，如 D:\\images\\miku.png' };
    }

    const imageAbs = path.resolve(image_path.trim());
    if (!fs.existsSync(imageAbs)) {
      return { success: false, error: `图片不存在: ${imageAbs}` };
    }

    const ext = path.extname(imageAbs).toLowerCase();
    if (ext !== '.png') {
      return { success: false, error: `需要 PNG 格式（透明背景），当前为 ${ext}。路径: ${imageAbs}` };
    }

    // 2. 生成 spec 名
    const safeName = sanitizeName(name || path.basename(imageAbs, ext));

    const specPath = path.join(SPECS_DIR, `${safeName}.json`);
    if (fs.existsSync(specPath)) {
      return {
        success: false,
        error: `UI spec '${safeName}' 已存在。换一个 name 或先调用 delete_ui_spec 删除旧的。`,
      };
    }

    // 3. 构建 FloatSprite spec
    const elementId = 'sprite';
    const initX = typeof x === 'number' ? x : 200;
    const initY = typeof y === 'number' ? y : 200;
    const w = typeof width === 'number' ? width : 150;
    const range = typeof floatRange === 'number' ? floatRange : 10;
    const msgs = Array.isArray(reminderMessages) && reminderMessages.length ? reminderMessages : undefined;
    const interval = typeof reminderInterval === 'number' && reminderInterval > 0
      ? reminderInterval
      : (msgs ? 15000 : undefined); // 有台词但没设间隔 → 默认 15 秒

    // 构建 FloatSprite props，有提醒则带上
    const spriteProps: Record<string, any> = {
      src: imageAbs,
      width: w,
      alt: safeName,
      floatRange: range,
    };
    if (msgs) spriteProps.reminderMessages = msgs;
    if (interval) spriteProps.reminderInterval = interval;
    if (followMouse) spriteProps.followMouse = true;
    if (typeof followSpeed === 'number') spriteProps.followSpeed = followSpeed;
    if (throwEnabled) spriteProps.throwEnabled = true;

    const spec = {
      data: {
        root: elementId,
        elements: {
          [elementId]: {
            type: 'FloatSprite',
            props: spriteProps,
            bindings: {
              position: { $bindState: '/sprite/pos' },
            },
          },
        },
      },
      displayName: safeName,
      description: `漂浮桌宠: ${safeName} (${w}px, 浮动±${range}px)`,
      initialState: {
        sprite: {
          pos: { x: initX, y: initY },
        },
      },
      actions: {},
    };

    // 4. 写入文件
    try {
      fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');
      notifySpecChanged();
    } catch (err: any) {
      return { success: false, error: `写入 spec 文件失败: ${err.message}` };
    }

    return {
      success: true,
      name: safeName,
      filePath: specPath,
      imagePath: imageAbs,
      message: `✅ 桌宠 '${safeName}' 创建成功！\n` +
        `  - 图片: ${imageAbs}\n` +
        `  - spec: ${specPath}\n` +
        `  - 大小: ${w}px | 漂浮幅度: ±${range}px | 初始位置: (${initX}, ${initY})\n` +
        (interval ? `  - 定时提醒: 每 ${(interval / 1000).toFixed(0)}s → [${(msgs || []).join(', ')}]\n` : '') +
        `  - 前端 3 秒内自动热加载`,
    };
  },
  {
    name: 'create_anime_sprite',
    description:
      '⭐ 从本地 PNG 图片创建一个可拖拽、上下漂浮的二次元桌宠。' +
      '支持：定时提醒气泡、跟随鼠标、扔出惯性+碰撞反弹。' +
      '创建时建议传 followMouse=true 和 throwEnabled=true 获得完整体验。' +
      'image_path 必须是绝对路径（如 D:\\images\\miku.png），且只能是 PNG（透明背景）。' +
      '创建后前端自动通过 SSE 热加载，无需刷新。',
    schema: z.object({
      image_path: z.string().describe('本地 PNG 的绝对路径，如 D:\\images\\miku.png'),
      name: z.string().optional().describe('桌宠名称（用作 spec 文件名），默认取图片文件名'),
      width: z.number().optional().describe('显示宽度（像素），默认 150'),
      floatRange: z.number().optional().describe('上下漂浮幅度（像素），默认 10'),
      x: z.number().optional().describe('初始 X 坐标，默认 200'),
      y: z.number().optional().describe('初始 Y 坐标，默认 200'),
      reminderInterval: z.number().optional().describe('定时提醒间隔（毫秒），如 15000=15秒。传了 reminderMessages 时若省略则默认 15000'),
      reminderMessages: z.array(z.string()).optional().describe('提醒台词语录，如 ["该喝水了主人", "主人我好无聊"]'),
      followMouse: z.boolean().optional().describe('是否跟随鼠标移动'),
      followSpeed: z.number().optional().describe('跟随速度 (0-1)，默认 0.04。越大跟得越紧'),
      throwEnabled: z.boolean().optional().describe('是否启用扔出惯性（拖拽松手后带动量滑动+碰撞反弹）'),
    }),
  }
);
