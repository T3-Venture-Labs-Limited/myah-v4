export const toMetronomeHourBoundary = (timestamp: Date | string): Date => {
  const boundary = new Date(timestamp);

  boundary.setUTCMinutes(0, 0, 0);

  return boundary;
};
