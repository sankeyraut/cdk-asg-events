export interface Event {
  asgname: string; //pk
  instanceid: string; //sk
  state: STATE; //launch , lifecycle action completed , inservice , etc
  starttimestamp: number; //current timestamp
  endtimestamp: number;
  description: string;
}
export enum STATE {
  LAUNCHED,
  LIFECYCLECOMPLETED,
  REGISTERED,
}
