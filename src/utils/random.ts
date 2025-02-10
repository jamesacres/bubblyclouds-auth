import { customAlphabet } from 'nanoid';

const randomHumanCode = (): string => {
  const code = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 9)();
  return `${code.substring(0, 3)}-${code.substring(3, 6)}-${code.substring(6, 9)}`.toUpperCase();
};

export { randomHumanCode };
