#[cfg(target_arch = "wasm32")]
mod allocator;
mod storage;

use std::cell::RefCell;
use std::collections::VecDeque;
use storage::{
    DependencyEdge, DepthQueue, EdgeArena, NodeRecord, NodeStore, NODE_EFFECT, NODE_MEMO,
    NODE_STATE,
};

const INPUT_PAGE_SIZE: usize = 64 * 1024;
const OUTPUT_PAGE_SIZE: usize = 64 * 1024;
const INPUT_FRAME_HEADER_SIZE: usize = 12;
const OUTPUT_PACKET_HEADER_SIZE: usize = 28;
const WINDOW_WORK_QUANTUM: u32 = 256;

const PACKET_START: u8 = 1;
const PACKET_END: u8 = 2;

const NODE_FRESH: u8 = 0;
const NODE_QUEUED: u8 = 2;
const NODE_EXPIRED: u8 = 3;
const NODE_DELETING: u8 = 4;

const PACKET_CALCULATE: u8 = 0;
const PACKET_FORWARD: u8 = 1;

const OPERATION_NONE: u8 = 0;
const OPERATION_DISPOSE: u8 = 1;
const OPERATION_CLEAN: u8 = 2;

struct Window {
    generation: u32,
    next_packet_id: u32,
    queued: bool,
    nodes: NodeStore,
    dependency_edges: EdgeArena,
    work_queue: DepthQueue,
    dispose_list: Vec<(u32, u32)>,
}

impl Window {
    fn new(generation: u32) -> Self {
        Self {
            generation,
            next_packet_id: 1,
            queued: false,
            nodes: NodeStore::new(),
            dependency_edges: EdgeArena::new(),
            work_queue: DepthQueue::new(),
            dispose_list: Vec::new(),
        }
    }

    fn queue_node(&mut self, node_id: u32) -> bool {
        let Some(node) = self.nodes.get(node_id) else {
            return false;
        };
        self.work_queue.push(node.depth, node_id);
        true
    }

    fn poll_node(&mut self) -> Option<u32> {
        self.work_queue.pop()
    }
}

struct PendingPacket {
    slot: u32,
    generation: u32,
    packet_id: u32,
    work_cost: u32,
    phase: u8,
    started: bool,
    operation: u8,
    operation_node_id: u32,
    operation_parent_id: u32,
    forward_ids: [u32; WINDOW_WORK_QUANTUM as usize],
    forward_count: usize,
    forward_index: usize,
}

impl PendingPacket {
    fn new(slot: u32, generation: u32, packet_id: u32) -> Self {
        Self {
            slot,
            generation,
            packet_id,
            work_cost: 0,
            phase: PACKET_CALCULATE,
            started: false,
            operation: OPERATION_NONE,
            operation_node_id: 0,
            operation_parent_id: 0,
            forward_ids: [0; WINDOW_WORK_QUANTUM as usize],
            forward_count: 0,
            forward_index: 0,
        }
    }
}

struct OutputWriter<'a> {
    buffer: &'a mut [u8],
    offset: usize,
    end: usize,
    deleted_count: u32,
}

impl OutputWriter<'_> {
    fn can_write_u32(&self) -> bool {
        self.offset + 4 <= self.end
    }

    fn write_u32(&mut self, value: u32) -> bool {
        if !self.can_write_u32() {
            return false;
        }
        write_u32(self.buffer, self.offset, value);
        self.offset += 4;
        true
    }

    fn write_deleted(&mut self, pending: &mut PendingPacket, node_id: u32) -> bool {
        if !self.write_u32(node_id) {
            return false;
        }
        self.deleted_count += 1;
        pending.work_cost = pending.work_cost.wrapping_add(1);
        true
    }
}

struct Scheduler {
    windows: Vec<Option<Window>>,
    generations: Vec<u32>,
    free_slots: Vec<u32>,
    active_windows: VecDeque<(u32, u32)>,
    pending: Option<PendingPacket>,
    input: Box<[u8; INPUT_PAGE_SIZE]>,
    output: Box<[u8; OUTPUT_PAGE_SIZE]>,
}

impl Scheduler {
    fn new() -> Self {
        Self {
            windows: vec![None],
            generations: vec![0],
            free_slots: Vec::new(),
            active_windows: VecDeque::new(),
            pending: None,
            input: Box::new([0; INPUT_PAGE_SIZE]),
            output: Box::new([0; OUTPUT_PAGE_SIZE]),
        }
    }

    fn register_window(&mut self, _window_id: u32) -> u32 {
        let slot = self.free_slots.pop().unwrap_or_else(|| {
            self.windows.push(None);
            self.generations.push(0);
            (self.windows.len() - 1) as u32
        });
        let index = slot as usize;
        let mut generation = self.generations[index].wrapping_add(1);
        if generation == 0 {
            generation = 1;
        }
        self.generations[index] = generation;
        self.windows[index] = Some(Window::new(generation));
        slot
    }

    fn deregister_window(&mut self, slot: u32, generation: u32) {
        let index = slot as usize;
        let is_current = self
            .windows
            .get(index)
            .and_then(Option::as_ref)
            .is_some_and(|window| window.generation == generation);
        if !is_current {
            return;
        }
        if self
            .pending
            .as_ref()
            .is_some_and(|pending| pending.slot == slot && pending.generation == generation)
        {
            self.pending = None;
        }
        self.windows[index] = None;
        self.free_slots.push(slot);
    }

    fn generation(&self, slot: u32) -> u32 {
        self.windows
            .get(slot as usize)
            .and_then(Option::as_ref)
            .map_or(0, |window| window.generation)
    }

    fn activate_window(&mut self, slot: u32) {
        let Some(window) = self.windows.get_mut(slot as usize).and_then(Option::as_mut) else {
            return;
        };
        if window.queued {
            return;
        }
        window.queued = true;
        self.active_windows.push_back((slot, window.generation));
    }

    fn take_active_window(&mut self) -> Option<(u32, u32)> {
        while let Some((slot, generation)) = self.active_windows.pop_front() {
            let Some(window) = self.windows.get_mut(slot as usize).and_then(Option::as_mut) else {
                continue;
            };
            if window.queued && window.generation == generation {
                window.queued = false;
                return Some((slot, generation));
            }
        }
        None
    }

    fn has_work(&self) -> bool {
        self.pending.is_some()
            || self.active_windows.iter().any(|(slot, generation)| {
                self.windows
                    .get(*slot as usize)
                    .and_then(Option::as_ref)
                    .is_some_and(|window| window.queued && window.generation == *generation)
            })
    }

    fn ingest(&mut self, length: usize) -> Result<(), ()> {
        if length > INPUT_PAGE_SIZE {
            return Err(());
        }
        let input = unsafe { std::slice::from_raw_parts(self.input.as_ptr(), length) };
        let mut offset = 0;
        while offset < length {
            if length - offset < INPUT_FRAME_HEADER_SIZE {
                return Err(());
            }
            let slot = read_u32(input, offset)?;
            let generation = read_u32(input, offset + 4)?;
            let command_length = read_u32(input, offset + 8)? as usize;
            let frame_end = offset
                .checked_add(INPUT_FRAME_HEADER_SIZE)
                .and_then(|value| value.checked_add(command_length))
                .filter(|end| *end <= length)
                .ok_or(())?;
            offset += INPUT_FRAME_HEADER_SIZE;
            let is_current = self
                .windows
                .get(slot as usize)
                .and_then(Option::as_ref)
                .is_some_and(|window| window.generation == generation);
            if !is_current {
                offset = frame_end;
                continue;
            }

            while offset < frame_end {
                let command = *input.get(offset).ok_or(())?;
                offset += 1;
                match command {
                    1 => {
                        let node = take_u32(input, &mut offset, frame_end)?;
                        let state = take_u32(input, &mut offset, frame_end)?;
                        self.register_dependency(slot, node, state)?;
                    }
                    2 => {
                        let effect = take_u32(input, &mut offset, frame_end)?;
                        let state = take_u32(input, &mut offset, frame_end)?;
                        self.register_state(slot, effect, state)?;
                    }
                    3 => {
                        let parent = take_u32(input, &mut offset, frame_end)?;
                        let effect = take_u32(input, &mut offset, frame_end)?;
                        self.register_effect(slot, parent, effect)?;
                    }
                    4 => {
                        let parent = take_u32(input, &mut offset, frame_end)?;
                        let effect = take_u32(input, &mut offset, frame_end)?;
                        self.dispose_effect(slot, parent, effect)?;
                    }
                    5 => {
                        let parent = take_u32(input, &mut offset, frame_end)?;
                        let memo = take_u32(input, &mut offset, frame_end)?;
                        self.register_memo(slot, parent, memo)?;
                    }
                    6 => {
                        let state = take_u32(input, &mut offset, frame_end)?;
                        self.post_state_write(slot, state)?;
                    }
                    _ => return Err(()),
                }
            }
            if offset != frame_end {
                return Err(());
            }
        }
        Ok(())
    }

    fn register_dependency(
        &mut self,
        slot: u32,
        active_node_id: u32,
        state_id: u32,
    ) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        let previous_for_node = window.nodes.get(active_node_id).ok_or(())?.last_source_edge;
        let previous_for_source = window.nodes.get(state_id).ok_or(())?.last_observer_edge;
        let edge_id = window.dependency_edges.allocate(DependencyEdge {
            observer_node_id: active_node_id,
            source_id: state_id,
            previous_for_node,
            next_for_node: 0,
            previous_for_source,
            next_for_source: 0,
        });

        if previous_for_node == 0 {
            window
                .nodes
                .get_mut(active_node_id)
                .unwrap()
                .first_source_edge = edge_id;
        } else {
            window
                .dependency_edges
                .get_mut(previous_for_node)
                .unwrap()
                .next_for_node = edge_id;
        }
        window
            .nodes
            .get_mut(active_node_id)
            .unwrap()
            .last_source_edge = edge_id;

        if previous_for_source == 0 {
            window.nodes.get_mut(state_id).unwrap().first_observer_edge = edge_id;
        } else {
            window
                .dependency_edges
                .get_mut(previous_for_source)
                .unwrap()
                .next_for_source = edge_id;
        }
        window.nodes.get_mut(state_id).unwrap().last_observer_edge = edge_id;
        Ok(())
    }

    fn register_state(&mut self, slot: u32, effect_id: u32, state_id: u32) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        let effect = window.nodes.get(effect_id).ok_or(())?;
        if effect.kind != NODE_EFFECT {
            return Err(());
        }
        let previous_state_id = effect.last_owned_state_id;
        window.nodes.insert(
            state_id,
            NodeRecord {
                kind: NODE_STATE,
                previous_owned_state_id: previous_state_id,
                ..NodeRecord::default()
            },
        )?;
        if previous_state_id == 0 {
            window
                .nodes
                .get_mut(effect_id)
                .unwrap()
                .first_owned_state_id = state_id;
        } else {
            window
                .nodes
                .get_mut(previous_state_id)
                .unwrap()
                .next_owned_state_id = state_id;
        }
        window.nodes.get_mut(effect_id).unwrap().last_owned_state_id = state_id;
        Ok(())
    }

    fn register_effect(&mut self, slot: u32, parent_id: u32, effect_id: u32) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        let depth = if parent_id == 0 {
            0
        } else {
            window.nodes.get(parent_id).ok_or(())?.depth + 1
        };
        window.nodes.insert(
            effect_id,
            NodeRecord {
                kind: NODE_EFFECT,
                depth,
                update_state: NODE_FRESH,
                parent_id,
                ..NodeRecord::default()
            },
        )?;
        if parent_id != 0 {
            append_child(window, parent_id, effect_id)?;
        }
        window.queue_node(effect_id);
        self.activate_window(slot);
        Ok(())
    }

    fn register_memo(&mut self, slot: u32, parent_id: u32, memo_id: u32) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        let depth = window.nodes.get(parent_id).ok_or(())?.depth + 1;

        window.nodes.insert(
            memo_id,
            NodeRecord {
                kind: NODE_MEMO,
                depth,
                update_state: NODE_FRESH,
                parent_id,
                ..NodeRecord::default()
            },
        )?;
        append_child(window, parent_id, memo_id)?;
        window.queue_node(memo_id);
        self.activate_window(slot);
        Ok(())
    }

    fn dispose_effect(&mut self, slot: u32, parent_id: u32, effect_id: u32) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        window.dispose_list.push((parent_id, effect_id));
        self.activate_window(slot);
        Ok(())
    }

    fn post_state_write(&mut self, slot: u32, state_id: u32) -> Result<(), ()> {
        let window = self.windows[slot as usize].as_mut().ok_or(())?;
        let Some(mut edge_id) = window
            .nodes
            .get(state_id)
            .map(|source| source.first_observer_edge)
        else {
            return Ok(());
        };
        let mut activated = false;

        while edge_id != 0 {
            let edge = *window.dependency_edges.get(edge_id).ok_or(())?;
            edge_id = edge.next_for_source;
            let Some(node) = window.nodes.get_mut(edge.observer_node_id) else {
                continue;
            };
            if node.update_state == NODE_FRESH {
                node.update_state = NODE_QUEUED;
                window.work_queue.push(node.depth, edge.observer_node_id);
                activated = true;
            }
        }
        if activated {
            self.activate_window(slot);
        }
        Ok(())
    }

    fn start_pending_packet(&mut self) -> bool {
        let Some((slot, generation)) = self.take_active_window() else {
            return false;
        };
        let window = self.windows[slot as usize].as_mut().unwrap();
        let packet_id = window.next_packet_id;
        window.next_packet_id = window.next_packet_id.wrapping_add(1);
        if window.next_packet_id == 0 {
            window.next_packet_id = 1;
        }
        self.pending = Some(PendingPacket::new(slot, generation, packet_id));
        true
    }

    fn drain(&mut self, requested_capacity: usize, work_budget: u32) -> usize {
        let capacity = requested_capacity.min(OUTPUT_PAGE_SIZE);
        if capacity < OUTPUT_PACKET_HEADER_SIZE + 4 {
            return 0;
        }
        let mut write_offset = 0;
        let mut drained_work_cost = 0;
        while capacity - write_offset >= OUTPUT_PACKET_HEADER_SIZE + 4 {
            if self.pending.is_none() && drained_work_cost >= work_budget {
                break;
            }
            if self.pending.is_none() && !self.start_pending_packet() {
                break;
            }
            let mut pending = self.pending.take().unwrap();
            let index = pending.slot as usize;
            let Some(mut window) = self.windows[index].take() else {
                continue;
            };
            if window.generation != pending.generation {
                self.windows[index] = Some(window);
                continue;
            }

            let header_offset = write_offset;
            write_offset += OUTPUT_PACKET_HEADER_SIZE;
            let mut requeue = false;
            let (next_write_offset, deleted_count, node_count) = {
                let mut writer = OutputWriter {
                    buffer: &mut self.output[..],
                    offset: write_offset,
                    end: capacity,
                    deleted_count: 0,
                };
                if pending.phase == PACKET_CALCULATE
                    && calculate_packet(&mut window, &mut pending, &mut writer)
                {
                    requeue = !window.dispose_list.is_empty() || !window.work_queue.is_empty();
                    pending.phase = PACKET_FORWARD;
                }
                let mut node_count = 0;
                if pending.phase == PACKET_FORWARD {
                    while pending.forward_index < pending.forward_count && writer.can_write_u32() {
                        writer.write_u32(pending.forward_ids[pending.forward_index]);
                        pending.forward_index += 1;
                        node_count += 1;
                    }
                }
                (writer.offset, writer.deleted_count, node_count)
            };
            write_offset = next_write_offset;
            let complete =
                pending.phase == PACKET_FORWARD && pending.forward_index == pending.forward_count;
            self.windows[index] = Some(window);
            if requeue {
                self.activate_window(pending.slot);
            }
            if deleted_count == 0 && node_count == 0 {
                write_offset = header_offset;
                if complete {
                    drained_work_cost = drained_work_cost.wrapping_add(pending.work_cost);
                    continue;
                }
                self.pending = Some(pending);
                break;
            }
            let mut flags = if pending.started { 0 } else { PACKET_START };
            if complete {
                flags |= PACKET_END;
            }
            write_packet_header(
                &mut self.output[..],
                header_offset,
                flags,
                &pending,
                deleted_count,
                node_count,
            );
            if complete {
                drained_work_cost = drained_work_cost.wrapping_add(pending.work_cost);
            } else {
                pending.started = true;
                self.pending = Some(pending);
            }
        }
        write_offset
    }
}

fn calculate_packet(
    window: &mut Window,
    pending: &mut PendingPacket,
    writer: &mut OutputWriter,
) -> bool {
    while pending.operation != OPERATION_NONE || pending.work_cost < WINDOW_WORK_QUANTUM {
        if pending.operation != OPERATION_NONE {
            if !continue_operation(window, pending, writer) {
                return false;
            }
            continue;
        }
        if let Some((parent_id, node_id)) = window.dispose_list.pop() {
            let Some(node) = window.nodes.get_mut(node_id) else {
                pending.work_cost = pending.work_cost.wrapping_add(1);
                continue;
            };
            if node.update_state == NODE_EXPIRED || node.update_state == NODE_DELETING {
                pending.work_cost = pending.work_cost.wrapping_add(1);
                continue;
            }
            node.update_state = NODE_DELETING;
            pending.operation = OPERATION_DISPOSE;
            pending.operation_node_id = node_id;
            pending.operation_parent_id = parent_id;
            continue;
        }
        let Some(node_id) = window.poll_node() else {
            break;
        };
        pending.work_cost = pending.work_cost.wrapping_add(1);
        let Some(node) = window.nodes.get(node_id) else {
            continue;
        };
        if node.update_state == NODE_EXPIRED || node.update_state == NODE_DELETING {
            continue;
        }
        if node.kind == NODE_EFFECT {
            remove_effect_states(window, node_id);
        }
        pending.operation = OPERATION_CLEAN;
        pending.operation_node_id = node_id;
        pending.operation_parent_id = 0;
    }
    true
}

fn continue_operation(
    window: &mut Window,
    pending: &mut PendingPacket,
    writer: &mut OutputWriter,
) -> bool {
    let node_id = pending.operation_node_id;
    let is_effect = window
        .nodes
        .get(node_id)
        .is_some_and(|node| node.kind == NODE_EFFECT);

    if is_effect && !remove_subtree(window, pending, writer, node_id) {
        return false;
    }

    if pending.operation == OPERATION_DISPOSE {
        if !writer.can_write_u32() {
            return false;
        }

        detach_child(window, node_id);
        if let Some(node) = window.nodes.get_mut(node_id) {
            node.update_state = NODE_EXPIRED;
        }
        cleanup_deleted_node(window, node_id);
        writer.write_deleted(pending, node_id);
    } else {
        remove_node_from_sources(window, node_id);

        if let Some(node) = window.nodes.get_mut(node_id) {
            node.update_state = NODE_FRESH;
        }

        if pending.forward_count < pending.forward_ids.len() {
            pending.forward_ids[pending.forward_count] = node_id;
            pending.forward_count += 1;
        }
    }
    pending.operation = OPERATION_NONE;
    pending.operation_node_id = 0;
    pending.operation_parent_id = 0;
    true
}

fn remove_subtree(
    window: &mut Window,
    pending: &mut PendingPacket,
    writer: &mut OutputWriter,
    node_id: u32,
) -> bool {
    loop {
        let child_id = window.nodes.get(node_id).map(|node| node.last_child_id);
        let Some(child_id) = child_id else {
            return true;
        };
        if child_id == 0 {
            return true;
        }

        let child_state = window.nodes.get(child_id).map(|node| node.update_state);

        if child_state.is_none() || child_state == Some(NODE_EXPIRED) {
            detach_child(window, child_id);
            continue;
        }

        window.nodes.get_mut(child_id).unwrap().update_state = NODE_DELETING;

        if window.nodes.get(child_id).unwrap().kind == NODE_EFFECT
            && !remove_subtree(window, pending, writer, child_id)
        {
            return false;
        }

        if !writer.can_write_u32() {
            return false;
        }

        detach_child(window, child_id);
        window.nodes.get_mut(child_id).unwrap().update_state = NODE_EXPIRED;
        cleanup_deleted_node(window, child_id);
        writer.write_deleted(pending, child_id);
    }
}

fn append_child(window: &mut Window, parent_id: u32, child_id: u32) -> Result<(), ()> {
    let previous_sibling_id = window.nodes.get(parent_id).ok_or(())?.last_child_id;
    if previous_sibling_id == 0 {
        window.nodes.get_mut(parent_id).unwrap().first_child_id = child_id;
    } else {
        window
            .nodes
            .get_mut(previous_sibling_id)
            .ok_or(())?
            .next_sibling_id = child_id;
    }
    window.nodes.get_mut(parent_id).unwrap().last_child_id = child_id;
    let child = window.nodes.get_mut(child_id).ok_or(())?;
    child.parent_id = parent_id;
    child.previous_sibling_id = previous_sibling_id;
    Ok(())
}

fn detach_child(window: &mut Window, child_id: u32) {
    let Some(child) = window.nodes.get(child_id).copied() else {
        return;
    };
    if child.parent_id == 0 {
        return;
    }

    if child.previous_sibling_id == 0 {
        if let Some(parent) = window.nodes.get_mut(child.parent_id) {
            parent.first_child_id = child.next_sibling_id;
        }
    } else if let Some(previous) = window.nodes.get_mut(child.previous_sibling_id) {
        previous.next_sibling_id = child.next_sibling_id;
    }

    if child.next_sibling_id == 0 {
        if let Some(parent) = window.nodes.get_mut(child.parent_id) {
            parent.last_child_id = child.previous_sibling_id;
        }
    } else if let Some(next) = window.nodes.get_mut(child.next_sibling_id) {
        next.previous_sibling_id = child.previous_sibling_id;
    }

    if let Some(child) = window.nodes.get_mut(child_id) {
        child.parent_id = 0;
        child.previous_sibling_id = 0;
        child.next_sibling_id = 0;
    }
}

fn remove_node_from_sources(window: &mut Window, node_id: u32) {
    loop {
        let Some(edge_id) = window.nodes.get(node_id).map(|node| node.first_source_edge) else {
            return;
        };
        if edge_id == 0 {
            return;
        }
        unlink_dependency(window, edge_id);
    }
}

fn remove_effect_states(window: &mut Window, node_id: u32) {
    loop {
        let Some(state_id) = window
            .nodes
            .get(node_id)
            .map(|node| node.first_owned_state_id)
        else {
            return;
        };
        if state_id == 0 {
            return;
        }
        let next_state_id = window
            .nodes
            .get(state_id)
            .map_or(0, |state| state.next_owned_state_id);
        remove_node_observers(window, state_id);
        window.nodes.remove(state_id);
        if let Some(effect) = window.nodes.get_mut(node_id) {
            effect.first_owned_state_id = next_state_id;
            if next_state_id == 0 {
                effect.last_owned_state_id = 0;
            }
        }
        if let Some(next_state) = window.nodes.get_mut(next_state_id) {
            next_state.previous_owned_state_id = 0;
        }
    }
}

fn cleanup_deleted_node(window: &mut Window, node_id: u32) {
    let Some(kind) = window.nodes.get(node_id).map(|node| node.kind) else {
        return;
    };
    if kind == NODE_EFFECT {
        remove_effect_states(window, node_id);
    }

    remove_node_from_sources(window, node_id);
    remove_node_observers(window, node_id);
    window.nodes.remove(node_id);
}

fn remove_node_observers(window: &mut Window, node_id: u32) {
    loop {
        let Some(edge_id) = window
            .nodes
            .get(node_id)
            .map(|node| node.first_observer_edge)
        else {
            return;
        };
        if edge_id == 0 {
            return;
        }
        unlink_dependency(window, edge_id);
    }
}

fn unlink_dependency(window: &mut Window, edge_id: u32) {
    let Some(edge) = window.dependency_edges.get(edge_id).copied() else {
        return;
    };

    if edge.previous_for_node == 0 {
        if let Some(node) = window.nodes.get_mut(edge.observer_node_id) {
            node.first_source_edge = edge.next_for_node;
        }
    } else if let Some(previous) = window.dependency_edges.get_mut(edge.previous_for_node) {
        previous.next_for_node = edge.next_for_node;
    }
    if edge.next_for_node == 0 {
        if let Some(node) = window.nodes.get_mut(edge.observer_node_id) {
            node.last_source_edge = edge.previous_for_node;
        }
    } else if let Some(next) = window.dependency_edges.get_mut(edge.next_for_node) {
        next.previous_for_node = edge.previous_for_node;
    }

    if edge.previous_for_source == 0 {
        if let Some(source) = window.nodes.get_mut(edge.source_id) {
            source.first_observer_edge = edge.next_for_source;
        }
    } else if let Some(previous) = window.dependency_edges.get_mut(edge.previous_for_source) {
        previous.next_for_source = edge.next_for_source;
    }
    if edge.next_for_source == 0 {
        if let Some(source) = window.nodes.get_mut(edge.source_id) {
            source.last_observer_edge = edge.previous_for_source;
        }
    } else if let Some(next) = window.dependency_edges.get_mut(edge.next_for_source) {
        next.previous_for_source = edge.previous_for_source;
    }

    window.dependency_edges.release(edge_id);
}

fn write_packet_header(
    buffer: &mut [u8],
    offset: usize,
    flags: u8,
    pending: &PendingPacket,
    deleted_count: u32,
    node_count: u32,
) {
    buffer[offset] = flags;
    buffer[offset + 1..offset + 4].fill(0);
    write_u32(buffer, offset + 4, pending.slot);
    write_u32(buffer, offset + 8, pending.generation);
    write_u32(buffer, offset + 12, pending.packet_id);
    write_u32(buffer, offset + 16, deleted_count);
    write_u32(buffer, offset + 20, node_count);
    write_u32(buffer, offset + 24, pending.work_cost);
}

fn take_u32(buffer: &[u8], offset: &mut usize, end: usize) -> Result<u32, ()> {
    if *offset + 4 > end {
        return Err(());
    }
    let value = read_u32(buffer, *offset)?;
    *offset += 4;
    Ok(value)
}

fn read_u32(buffer: &[u8], offset: usize) -> Result<u32, ()> {
    let bytes: [u8; 4] = buffer
        .get(offset..offset + 4)
        .ok_or(())?
        .try_into()
        .unwrap();
    Ok(u32::from_le_bytes(bytes))
}

fn write_u32(buffer: &mut [u8], offset: usize, value: u32) {
    buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

thread_local! { static SCHEDULER: RefCell<Scheduler> = RefCell::new(Scheduler::new()); }

#[no_mangle]
pub extern "C" fn scheduler_register_window(window_id: u32) -> u32 {
    SCHEDULER.with(|scheduler| scheduler.borrow_mut().register_window(window_id))
}
#[no_mangle]
pub extern "C" fn scheduler_window_generation(slot: u32) -> u32 {
    SCHEDULER.with(|scheduler| scheduler.borrow().generation(slot))
}
#[no_mangle]
pub extern "C" fn scheduler_deregister_window(slot: u32, generation: u32) {
    SCHEDULER.with(|scheduler| scheduler.borrow_mut().deregister_window(slot, generation));
}
#[no_mangle]
pub extern "C" fn scheduler_input_ptr() -> *mut u8 {
    SCHEDULER.with(|scheduler| scheduler.borrow_mut().input.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn scheduler_output_ptr() -> *mut u8 {
    SCHEDULER.with(|scheduler| scheduler.borrow_mut().output.as_mut_ptr())
}
#[no_mangle]
pub extern "C" fn scheduler_ingest(length: u32) -> u32 {
    SCHEDULER.with(|scheduler| {
        if scheduler.borrow_mut().ingest(length as usize).is_ok() {
            0
        } else {
            1
        }
    })
}
#[no_mangle]
pub extern "C" fn scheduler_drain_work(capacity: u32, work_budget: u32) -> u32 {
    SCHEDULER.with(|scheduler| scheduler.borrow_mut().drain(capacity as usize, work_budget) as u32)
}
#[no_mangle]
pub extern "C" fn scheduler_has_work() -> u32 {
    SCHEDULER.with(|scheduler| scheduler.borrow().has_work() as u32)
}
