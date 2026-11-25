/**
 * 站点数据集合与字段契约声明（严格对齐 cizhenyu_payload 三层字段规范）。
 * - 阶段一（全静态）：约束 mocks/seed.json 与页面渲染 props 的字段结构。
 * - 阶段二（对接后台）：WebDesign 扫描器读取此契约做合规校验，并交由 Agent 通过 cmsmcp 幂等创建集合。
 */

export interface CmsFieldSpec {
  name: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'multi_select'
    | 'boolean'
    | 'date'
    | 'image'
    | 'file'
    | 'richtext'
    | 'json'
    | 'relation'
    | 'relation_multi'
    | 'reference';
  required?: boolean;
  options?: Array<string | { label: string; value: string }>;
  defaultValue?: unknown;
  isListDisplay?: boolean;
  ui?: { group?: '_seo' | '_schema' | '_geo' };
}

export interface CmsCollectionContract {
  logical: string;
  name: string;
  /** 优先复用 cizhenyu_payload 标准全局模型；仅特殊定制模块新建 {siteKey}_{logical} 模型 */
  modelSlug: string;
  reuseGlobalModel: boolean;
  groupSubPath: 'settings' | 'products' | 'content' | 'business';
  presentationMode: 'list' | 'single_form';
  apiMode: 'public_read' | 'submit_only';
  fields: CmsFieldSpec[];
}

export const SITE_COLLECTIONS_CONTRACT: CmsCollectionContract[] = [
  {
    logical: 'company_info',
    name: '企业基础信息',
    modelSlug: 'company_info',
    reuseGlobalModel: true,
    groupSubPath: 'settings',
    presentationMode: 'single_form',
    apiMode: 'public_read',
    fields: [
      { name: 'name', label: '公司名称', type: 'text', required: true },
      { name: 'slogan', label: '品牌标语', type: 'text' },
      { name: 'summary', label: '公司简介', type: 'textarea' },
      { name: 'short_answer', label: 'GEO 简答', type: 'textarea' },
      { name: 'email', label: '联系邮箱', type: 'text' },
      { name: 'phone', label: '联系电话', type: 'text' },
      { name: 'address', label: '办公地址', type: 'text' },
      { name: 'logo', label: 'Logo', type: 'image' }
    ]
  },
  {
    logical: 'product',
    name: '核心产品',
    modelSlug: 'b2b_product',
    reuseGlobalModel: true,
    groupSubPath: 'products',
    presentationMode: 'list',
    apiMode: 'public_read',
    fields: [
      { name: 'title', label: '产品名称', type: 'text', required: true, isListDisplay: true },
      { name: 'slug', label: 'URL Slug', type: 'text', required: true, isListDisplay: true },
      { name: 'sku', label: '产品型号', type: 'text', isListDisplay: true },
      { name: 'category_label', label: '产品系列', type: 'text' },
      { name: 'summary', label: '核心摘要', type: 'textarea' },
      { name: 'short_answer', label: 'GEO 简答', type: 'textarea' },
      { name: 'cover', label: '主图', type: 'image' },
      { name: 'content', label: '详细说明', type: 'richtext' },
      { name: 'spec_data', label: '规格参数表', type: 'json' },
      { name: 'status', label: '发布状态', type: 'select', options: ['draft', 'published'], defaultValue: 'published' },
      { name: 'sort_order', label: '排序', type: 'number', defaultValue: 0 },
      { name: 'seo_title', label: 'SEO 标题', type: 'text', ui: { group: '_seo' } },
      { name: 'seo_description', label: 'SEO 描述', type: 'textarea', ui: { group: '_seo' } }
    ]
  },
  {
    logical: 'article',
    name: '技术资讯与指南',
    modelSlug: 'article',
    reuseGlobalModel: true,
    groupSubPath: 'content',
    presentationMode: 'list',
    apiMode: 'public_read',
    fields: [
      { name: 'title', label: '文章标题', type: 'text', required: true, isListDisplay: true },
      { name: 'slug', label: 'URL Slug', type: 'text', required: true, isListDisplay: true },
      { name: 'author', label: '作者', type: 'text' },
      { name: 'summary', label: '文章摘要', type: 'textarea' },
      { name: 'short_answer', label: 'GEO 简答', type: 'textarea' },
      { name: 'cover', label: '封面图', type: 'image' },
      { name: 'content', label: '正文内容', type: 'richtext' },
      { name: 'status', label: '发布状态', type: 'select', options: ['draft', 'published'], defaultValue: 'published' },
      { name: 'seo_title', label: 'SEO 标题', type: 'text', ui: { group: '_seo' } },
      { name: 'seo_description', label: 'SEO 描述', type: 'textarea', ui: { group: '_seo' } }
    ]
  },
  {
    logical: 'faq',
    name: '常见问题 (FAQ)',
    modelSlug: 'faq',
    reuseGlobalModel: true,
    groupSubPath: 'content',
    presentationMode: 'list',
    apiMode: 'public_read',
    fields: [
      { name: 'question', label: '问题', type: 'text', required: true, isListDisplay: true },
      { name: 'answer', label: '回答', type: 'textarea', required: true },
      { name: 'status', label: '发布状态', type: 'select', options: ['draft', 'published'], defaultValue: 'published' },
      { name: 'sort_order', label: '排序', type: 'number', defaultValue: 0 }
    ]
  },
  {
    logical: 'inquiry',
    name: '客户询盘表单',
    modelSlug: 'b2b_inquiry',
    reuseGlobalModel: true,
    groupSubPath: 'business',
    presentationMode: 'list',
    apiMode: 'submit_only',
    fields: [
      { name: 'contact_name', label: '联系人姓名', type: 'text', required: true, isListDisplay: true },
      { name: 'email', label: '商务邮箱', type: 'text', required: true, isListDisplay: true },
      { name: 'company', label: '公司名称', type: 'text', isListDisplay: true },
      { name: 'country', label: '国家/地区', type: 'text' },
      { name: 'product_interest', label: '意向产品', type: 'text' },
      { name: 'message', label: '需求详情', type: 'textarea', required: true }
    ]
  }
];
