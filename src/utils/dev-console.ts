/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { IS_DEV } from '@/constants';

export const devConsole = (message?: any, ...optionalParams: any[]) => {
  if (IS_DEV) return console.log(message, ...optionalParams);
};
