class MinHeap {
    constructor(compare) {
        this.heap = [];
        this.compare = compare; // (a, b) => number, like (a, b) => a.f - b.f
    }

    push(value) {
        this.heap.push(value);
        this._heapifyUp();
    }

    pop() {
        if (this.heap.length === 1) return this.heap.pop();
        const top = this.heap[0];
        this.heap[0] = this.heap.pop();
        this._heapifyDown();
        return top;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    _heapifyUp() {
        let index = this.heap.length - 1;
        const element = this.heap[index];
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];
            if (this.compare(element, parent) >= 0) break;
            this.heap[index] = parent;
            index = parentIndex;
        }
        this.heap[index] = element;
    }

    _heapifyDown() {
        let index = 0;
        const length = this.heap.length;
        const element = this.heap[0];
        while (true) {
            let leftIndex = 2 * index + 1;
            let rightIndex = 2 * index + 2;
            let smallest = index;
            if (leftIndex < length && this.compare(this.heap[leftIndex], this.heap[smallest]) < 0) smallest = leftIndex;
            if (rightIndex < length && this.compare(this.heap[rightIndex], this.heap[smallest]) < 0) smallest = rightIndex;
            if (smallest === index) break;
            this.heap[index] = this.heap[smallest];
            index = smallest;
        }
        this.heap[index] = element;
    }
}

class PriorityQueue {
  constructor() {
    this.heap = new MinHeap((a, b) => a.priority - b.priority);
  }

  enqueue(node, priority) {
    this.heap.push({ node, priority });
  }

  dequeue() {
    if (this.heap.isEmpty()) return null;
    return this.heap.pop().node;
  }

  isEmpty() {
    return this.heap.isEmpty();
  }
}