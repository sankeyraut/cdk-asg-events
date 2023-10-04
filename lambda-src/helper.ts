function randomIntFromInterval(min: number, max: number) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function customBackoffFunction(retryCount: number, err: any) {
  var delay = Math.pow(2, retryCount) * 1000 + randomIntFromInterval(50, 5000);
  console.log(
    "backoff and jitter delay is ",
    delay,
    "retryCount is ",
    retryCount
  );
  return delay;
}
