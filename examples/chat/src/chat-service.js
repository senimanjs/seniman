
export let chatService = {
  callbacks: [],

  // 15 rows of preloaded data
  incrementingId: 15,
  messageData: [
    { id: 1, text: "Hello", user: 'User1' },
    { id: 2, text: "World", user: 'User1' },
    { id: 3, text: "This", user: 'User1' },
    { id: 4, text: "Is", user: 'User1' },
    { id: 5, text: "A", user: 'User1' },
    { id: 6, text: "Chat", user: 'User1' },
    { id: 7, text: "App", user: 'User1' },
    { id: 8, text: "With", user: 'User1' },
    { id: 9, text: "Seniman", user: 'User1' },
    { id: 10, text: "And", user: 'User1' },
    { id: 11, text: "NodeJS", user: 'User1' },
    { id: 12, text: "And", user: 'User1' },
    { id: 13, text: "In-Memory", user: 'User1' },
    { id: 14, text: "Database", user: 'User1' },
    { id: 15, text: "Try it out!", user: 'User1' }
  ],

  getMessage: (id) => {
    // TODO: use something like fb's dataloader to batch requests (and a real db of course)
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(chatService.messageData.find(m => m.id == id));
      }, 10);
    });
  },

  submitMessage: async (user, text) => {
    return new Promise((resolve, reject) => {

      let id = ++chatService.incrementingId;
      chatService.messageData.push({ id, text, user });

      setTimeout(() => {
        resolve({ id, text });

        setImmediate(() => {
          chatService.callbacks.forEach(cb => cb(id));
        });
      }, 10);
    });
  },

  loadLastNMessageIds: async (n) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        let ids = [];
        let startIndex = Math.max(0, chatService.messageData.length - n);
        let messageCount = chatService.messageData.length;

        for (let i = startIndex; i < messageCount; i++) {
          ids.push(chatService.messageData[i].id);
        }

        resolve(ids);
      }, 50);
    });
  },

  loadMessageIdsFromOffset: async (offset, limit) => {

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        let ids = [];
        let startIndex = Math.max(0, offset);
        let endIndex = Math.min(chatService.messageData.length, offset + limit - 1);

        for (let i = startIndex; i < endIndex; i++) {
          ids.push(chatService.messageData[i].id);
        }

        resolve(ids);
      }, 50);
    });
  },

  listenNewMessageId: (cb) => {
    chatService.callbacks.push(cb);

    return () => {
      // remove callback
      let index = chatService.callbacks.indexOf(cb);
      if (index > -1) {
        chatService.callbacks.splice(index, 1);
      }
    }
  },

  deleteMessage: async (id) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        let index = chatService.messageData.findIndex(m => m.id == id);
        chatService.messageData.splice(index, 1);
        resolve();
      }, 10);
    });
  }
};