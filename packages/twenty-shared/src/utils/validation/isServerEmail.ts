import { isEmail } from 'class-validator';

export const isServerEmail = (value: string) => isEmail(value);
