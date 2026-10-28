// An error whose message is written for the user and goes into the float as
// is, while `detail` holds what actually happened for the log. Everything
// else that throws is shown as "Paperclip hit an error: ...".
export class Notice extends Error {
  constructor(message: string, readonly detail: string = message) {
    super(message);
    this.name = 'Notice';
  }
}
