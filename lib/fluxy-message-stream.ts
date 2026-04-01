type FluxyMessageEvent = {
  type: "message.created";
  payload: {
    boardId: string;
    relatedCardId: string | null;
    messageId: string;
    createdAt: string;
  };
};

type Subscriber = (event: FluxyMessageEvent) => void;

const boardSubscribers = new Map<string, Set<Subscriber>>();
const cardSubscribers = new Map<string, Set<Subscriber>>();

function cardKey(boardId: string, cardId: string): string {
  return `${boardId}:${cardId}`;
}

function removeSubscriber(map: Map<string, Set<Subscriber>>, key: string, cb: Subscriber): void {
  const subs = map.get(key);
  if (!subs) return;
  subs.delete(cb);
  if (subs.size === 0) map.delete(key);
}

export function subscribeFluxyBoardMessages(boardId: string, cb: Subscriber): () => void {
  const subs = boardSubscribers.get(boardId) ?? new Set<Subscriber>();
  subs.add(cb);
  boardSubscribers.set(boardId, subs);
  return () => removeSubscriber(boardSubscribers, boardId, cb);
}

export function subscribeFluxyCardMessages(boardId: string, cardId: string, cb: Subscriber): () => void {
  const key = cardKey(boardId, cardId);
  const subs = cardSubscribers.get(key) ?? new Set<Subscriber>();
  subs.add(cb);
  cardSubscribers.set(key, subs);
  return () => removeSubscriber(cardSubscribers, key, cb);
}

export function publishFluxyMessageCreated(input: {
  boardId: string;
  relatedCardId: string | null;
  messageId: string;
  createdAt: string;
}): void {
  const event: FluxyMessageEvent = {
    type: "message.created",
    payload: {
      boardId: input.boardId,
      relatedCardId: input.relatedCardId,
      messageId: input.messageId,
      createdAt: input.createdAt,
    },
  };

  const boardSubs = boardSubscribers.get(input.boardId);
  boardSubs?.forEach((cb) => cb(event));

  if (input.relatedCardId) {
    const key = cardKey(input.boardId, input.relatedCardId);
    const scopedSubs = cardSubscribers.get(key);
    scopedSubs?.forEach((cb) => cb(event));
  }
}
