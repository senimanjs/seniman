use std::collections::VecDeque;

pub const NODE_NONE: u8 = 0;
pub const NODE_EFFECT: u8 = 1;
pub const NODE_MEMO: u8 = 2;
pub const NODE_STATE: u8 = 3;

const NODE_PAGE_SHIFT: usize = 6;
const NODE_PAGE_SIZE: usize = 1 << NODE_PAGE_SHIFT;
const NODE_PAGE_MASK: usize = NODE_PAGE_SIZE - 1;

#[derive(Clone, Copy, Default)]
pub struct NodeRecord {
    pub kind: u8,
    pub update_state: u8,
    pub depth: u32,
    pub parent_id: u32,
    pub first_child_id: u32,
    pub last_child_id: u32,
    pub previous_sibling_id: u32,
    pub next_sibling_id: u32,
    pub first_owned_state_id: u32,
    pub last_owned_state_id: u32,
    pub previous_owned_state_id: u32,
    pub next_owned_state_id: u32,
    pub first_source_edge: u32,
    pub last_source_edge: u32,
    pub first_observer_edge: u32,
    pub last_observer_edge: u32,
}

struct NodePage {
    records: Box<[NodeRecord; NODE_PAGE_SIZE]>,
    live_count: u16,
}

impl NodePage {
    fn new() -> Self {
        Self {
            records: Box::new([NodeRecord::default(); NODE_PAGE_SIZE]),
            live_count: 0,
        }
    }
}

pub struct NodeStore {
    pages: Vec<Option<NodePage>>,
}

impl NodeStore {
    pub fn new() -> Self {
        Self { pages: Vec::new() }
    }

    pub fn insert(&mut self, id: u32, record: NodeRecord) -> Result<(), ()> {
        let index = id as usize;
        let page_index = index >> NODE_PAGE_SHIFT;
        let record_index = index & NODE_PAGE_MASK;
        if page_index >= self.pages.len() {
            self.pages.resize_with(page_index + 1, || None);
        }
        let page = self.pages[page_index].get_or_insert_with(NodePage::new);
        if page.records[record_index].kind != NODE_NONE {
            return Err(());
        }
        page.records[record_index] = record;
        page.live_count += 1;
        Ok(())
    }

    pub fn get(&self, id: u32) -> Option<&NodeRecord> {
        let index = id as usize;
        let record = self
            .pages
            .get(index >> NODE_PAGE_SHIFT)?
            .as_ref()?
            .records
            .get(index & NODE_PAGE_MASK)?;
        (record.kind != NODE_NONE).then_some(record)
    }

    pub fn get_mut(&mut self, id: u32) -> Option<&mut NodeRecord> {
        let index = id as usize;
        let record = self
            .pages
            .get_mut(index >> NODE_PAGE_SHIFT)?
            .as_mut()?
            .records
            .get_mut(index & NODE_PAGE_MASK)?;
        (record.kind != NODE_NONE).then_some(record)
    }

    pub fn remove(&mut self, id: u32) -> Option<NodeRecord> {
        let index = id as usize;
        let page_index = index >> NODE_PAGE_SHIFT;
        let record_index = index & NODE_PAGE_MASK;
        let page = self.pages.get_mut(page_index)?.as_mut()?;
        if page.records[record_index].kind == NODE_NONE {
            return None;
        }
        let record = std::mem::take(&mut page.records[record_index]);
        page.live_count -= 1;
        if page.live_count == 0 {
            self.pages[page_index] = None;
        }
        Some(record)
    }
}

#[derive(Clone, Copy, Default)]
pub struct DependencyEdge {
    pub observer_node_id: u32,
    pub source_id: u32,
    pub previous_for_node: u32,
    pub next_for_node: u32,
    pub previous_for_source: u32,
    pub next_for_source: u32,
}

pub struct EdgeArena {
    edges: Vec<DependencyEdge>,
    free_head: u32,
}

impl EdgeArena {
    pub fn new() -> Self {
        let mut edges = Vec::with_capacity(64);
        edges.push(DependencyEdge::default());
        Self {
            edges,
            free_head: 0,
        }
    }

    pub fn allocate(&mut self, edge: DependencyEdge) -> u32 {
        if self.free_head != 0 {
            let id = self.free_head;
            self.free_head = self.edges[id as usize].next_for_node;
            self.edges[id as usize] = edge;
            id
        } else {
            let id = self.edges.len() as u32;
            self.edges.push(edge);
            id
        }
    }

    pub fn get(&self, id: u32) -> Option<&DependencyEdge> {
        (id != 0).then(|| self.edges.get(id as usize)).flatten()
    }

    pub fn get_mut(&mut self, id: u32) -> Option<&mut DependencyEdge> {
        (id != 0).then(|| self.edges.get_mut(id as usize)).flatten()
    }

    pub fn release(&mut self, id: u32) {
        let edge = &mut self.edges[id as usize];
        *edge = DependencyEdge {
            next_for_node: self.free_head,
            ..DependencyEdge::default()
        };
        self.free_head = id;
    }
}

pub struct DepthQueue {
    buckets: Vec<VecDeque<u32>>,
    minimum_depth: usize,
    length: usize,
}

impl DepthQueue {
    pub fn new() -> Self {
        Self {
            buckets: Vec::new(),
            minimum_depth: 0,
            length: 0,
        }
    }

    pub fn push(&mut self, depth: u32, node_id: u32) {
        let depth = depth as usize;
        if depth >= self.buckets.len() {
            self.buckets.resize_with(depth + 1, VecDeque::new);
        }
        self.buckets[depth].push_back(node_id);
        if self.length == 0 || depth < self.minimum_depth {
            self.minimum_depth = depth;
        }
        self.length += 1;
    }

    pub fn pop(&mut self) -> Option<u32> {
        while self.minimum_depth < self.buckets.len() {
            if let Some(node_id) = self.buckets[self.minimum_depth].pop_front() {
                self.length -= 1;
                if self.length == 0 {
                    self.minimum_depth = 0;
                }
                return Some(node_id);
            }
            self.minimum_depth += 1;
        }
        self.minimum_depth = 0;
        None
    }

    pub fn is_empty(&self) -> bool {
        self.length == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_pages_release_when_their_last_record_is_removed() {
        let mut nodes = NodeStore::new();
        nodes
            .insert(
                65,
                NodeRecord {
                    kind: NODE_EFFECT,
                    ..NodeRecord::default()
                },
            )
            .unwrap();

        assert_eq!(nodes.get(65).unwrap().kind, NODE_EFFECT);
        assert_eq!(nodes.remove(65).unwrap().kind, NODE_EFFECT);
        assert!(nodes.pages[1].is_none());
    }

    #[test]
    fn dependency_edge_slots_are_reused() {
        let mut edges = EdgeArena::new();
        let first = edges.allocate(DependencyEdge {
            observer_node_id: 4,
            source_id: 3,
            ..DependencyEdge::default()
        });
        edges.release(first);
        let reused = edges.allocate(DependencyEdge {
            observer_node_id: 6,
            source_id: 5,
            ..DependencyEdge::default()
        });

        assert_eq!(reused, first);
        assert_eq!(edges.get(reused).unwrap().observer_node_id, 6);
    }

    #[test]
    fn depth_queue_is_stable_within_each_depth() {
        let mut queue = DepthQueue::new();
        queue.push(3, 30);
        queue.push(1, 10);
        queue.push(2, 20);
        queue.push(1, 11);

        assert_eq!(queue.pop(), Some(10));
        assert_eq!(queue.pop(), Some(11));
        assert_eq!(queue.pop(), Some(20));
        assert_eq!(queue.pop(), Some(30));
        assert!(queue.is_empty());
    }
}
