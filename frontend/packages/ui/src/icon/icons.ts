import { IconPlus, IconX, IconChevronDown, IconChevronRight, IconCheck, IconEllipsis, IconArrowUp, IconArrowLeft, IconPaperclip, IconInfo, IconTriangleAlert, IconCode, IconBriefcase, IconLayers, IconUsers, IconSettings, IconSparkles, IconCircleUser, IconTerminal, IconFile, IconFolder, IconRefreshCw, IconLoaderCircle } from '@eap/icons';

/** Bounded local catalog; no remote names or dynamic imports. */
export const iconComponents = {
  'plus': IconPlus,
  'x': IconX,
  'chevron-down': IconChevronDown,
  'chevron-right': IconChevronRight,
  'check': IconCheck,
  'ellipsis': IconEllipsis,
  'arrow-up': IconArrowUp,
  'arrow-left': IconArrowLeft,
  'paperclip': IconPaperclip,
  'info': IconInfo,
  'triangle-alert': IconTriangleAlert,
  'code': IconCode,
  'briefcase': IconBriefcase,
  'layers': IconLayers,
  'users': IconUsers,
  'settings': IconSettings,
  'sparkles': IconSparkles,
  'circle-user': IconCircleUser,
  'terminal': IconTerminal,
  'file': IconFile,
  'folder': IconFolder,
  'refresh-cw': IconRefreshCw,
  'loader-circle': IconLoaderCircle,
} as const;
export type IconName = keyof typeof iconComponents;
