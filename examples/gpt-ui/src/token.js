
/*
 This tokenizer is basically a buffering tokenizer that makes sure tokens coming in from the API
 that are important for "content containerization" such as:
 
 - three-backticks (codeblocks)
 - single-backtick (codespans)
 - newlines (paragraphs) 

 are given to the UI layer as single complete tokens. This enables easier token handling logic within the UI layer.
*/
export class Tokenizer {
  constructor() {
    this.callback = null;
    this.queue = [];
    this.tokenBuffer = '';
    this.backtickCount = 0;
  }

  tokenize2(textToken) {

    if (textToken === '[DONE]') {
      return [this.tokenBuffer, textToken];
    }

    let returnTokens = [];
    let tokenLength = textToken.length;

    let flushBuffer = () => {
      if (this.tokenBuffer) {
        returnTokens.push(this.tokenBuffer);
        this.tokenBuffer = '';
      }
    }

    for (let i = 0; i < tokenLength; i++) {
      let char = textToken[i];

      if (char === '`') {
        if (this.backtickCount === 0) {
          flushBuffer();
        }

        this.backtickCount++;
        this.tokenBuffer += char;

        if (this.backtickCount === 3) {
          this.backtickCount = 0;
          flushBuffer();
        }
      } else {
        // reset backtick count (and flush) if it sees a non-backtick character
        if (this.backtickCount > 0) {
          this.backtickCount = 0;
          flushBuffer();
        }

        if (char === '\n') {
          flushBuffer();
          returnTokens.push(char);
        } else {
          this.tokenBuffer += char;
        }
      }
    }

    if (this.backtickCount === 0) {
      flushBuffer();
    }

    return returnTokens;
  }

  processToken(textToken) {
    let tokens = this.tokenize2(textToken);

    if (!tokens) {
      return;
    }

    this.callback(tokens);
  }

  onResultTokens(callback) {
    this.callback = callback;

    while (this.queue.length > 0) {
      this.processToken(this.queue.shift());
    }
  }

  feedInputToken(textToken) {
    if (!this.callback) {
      this.queue.push(textToken);
    } else {
      this.processToken(textToken);
    }
  }
}