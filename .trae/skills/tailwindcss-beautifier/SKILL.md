---
name: "tailwindcss-beautifier"
description: "使用TailwindCSS优化React组件样式。Invoke when user asks to beautify UI, improve component styling, or optimize visual design."
---

# TailwindCSS React组件美化工具

这个skill帮助使用TailwindCSS优化React组件的视觉效果。

## 核心原则

### 1. 按钮样式优化
- 使用`rounded-lg`或`rounded-xl`替代直角
- 添加`hover:`系列伪类增强交互感
- 使用`transition-all duration-200`添加过渡动画
- 颜色层次：`bg-blue-600` hover → `bg-blue-700` active

### 2. 卡片组件
```tsx
// 优化前
<div className="bg-white p-4 border">

// 优化后
<div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-5 border border-gray-100">
```

### 3. 输入框和表单
```tsx
// 优化前
<input className="border p-2">

// 优化后
<input className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200">
```

### 4. 表格样式
- 表头使用`bg-gray-50`和`font-semibold`
- 行使用`hover:bg-gray-50`增强可读性
- 添加`divide-y divide-gray-200`分隔线

### 5. 布局和间距
- 容器：`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- 间距递增：4, 6, 8（避免使用奇数值）
- 使用`space-y-4`或`gap-4`管理垂直间距

## 常用样式类

### 颜色系统
- 主色：`blue-{50-900}`
- 成功：`green-{50-900}`
- 警告：`yellow-{50-900}`
- 错误：`red-{50-900}`
- 中性：`gray-{50-900}`

### 阴影层级
```tsx
shadow-sm    // 轻微阴影
shadow-md    // 中等阴影（卡片默认）
shadow-lg    // 大阴影（弹窗）
shadow-xl    // 更大阴影
```

### 圆角
```tsx
rounded-sm   // 2px
rounded      // 4px
rounded-md   // 6px
rounded-lg   // 8px（按钮默认）
rounded-xl   // 12px
rounded-2xl  // 16px
rounded-full // 完全圆角
```

## 优化流程

1. **分析当前样式**：检查组件的className
2. **识别问题**：直角边框、缺少hover效果、颜色对比度不足等
3. **应用优化规则**：按上述原则进行美化
4. **保持一致性**：确保同类型组件使用相同的样式模式

## 触发条件

当用户出现以下情况时自动调用此skill：
- "美化UI"
- "优化样式"
- "按钮/卡片不好看"
- "界面太丑"
- "改善视觉效果"
- "让界面更好看"
- 任何与前端组件样式相关的请求

## 注意事项

1. 保持移动端响应式（使用`sm:`、`md:`、`lg:`前缀）
2. 不要过度使用阴影和动画，影响性能
3. 保持颜色对比度符合可访问性标准
4. 遵循项目的TailwindCSS配置和自定义主题
