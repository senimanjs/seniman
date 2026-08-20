use core::alloc::{GlobalAlloc, Layout};
use core::arch::wasm32;
use core::cell::Cell;
use core::ptr;
use dlmalloc::{Allocator, Dlmalloc};

const WASM_PAGE_SIZE: usize = 64 * 1024;
const INITIAL_GROWTH_SIZE: usize = 1024 * 1024;
const MAX_GROWTH_SIZE: usize = 64 * 1024 * 1024;

struct ChunkedWasmAllocator {
    next_growth_size: Cell<usize>,
}

impl ChunkedWasmAllocator {
    const fn new() -> Self {
        Self {
            next_growth_size: Cell::new(INITIAL_GROWTH_SIZE),
        }
    }
}

unsafe impl Allocator for ChunkedWasmAllocator {
    fn alloc(&self, size: usize) -> (*mut u8, usize, u32) {
        let growth_size = self.next_growth_size.get();
        let allocation_size = size.max(growth_size);
        let pages = allocation_size.div_ceil(WASM_PAGE_SIZE);
        let previous_pages = wasm32::memory_grow(0, pages);

        if previous_pages == usize::MAX {
            return (ptr::null_mut(), 0, 0);
        }

        self.next_growth_size
            .set(growth_size.saturating_mul(2).min(MAX_GROWTH_SIZE));

        let base = previous_pages * WASM_PAGE_SIZE;
        let actual_size = pages * WASM_PAGE_SIZE;

        if base.wrapping_add(actual_size) == 0 {
            return (base as *mut u8, actual_size - 16, 0);
        }

        (base as *mut u8, actual_size, 0)
    }

    fn remap(&self, _ptr: *mut u8, _old_size: usize, _new_size: usize, _can_move: bool) -> *mut u8 {
        ptr::null_mut()
    }

    fn free_part(&self, _ptr: *mut u8, _old_size: usize, _new_size: usize) -> bool {
        false
    }

    fn free(&self, _ptr: *mut u8, _size: usize) -> bool {
        false
    }

    fn can_release_part(&self, _flags: u32) -> bool {
        false
    }

    fn allocates_zeros(&self) -> bool {
        true
    }

    fn page_size(&self) -> usize {
        WASM_PAGE_SIZE
    }
}

struct GlobalChunkedDlmalloc;

static mut DLMALLOC: Dlmalloc<ChunkedWasmAllocator> =
    Dlmalloc::new_with_allocator(ChunkedWasmAllocator::new());

unsafe impl GlobalAlloc for GlobalChunkedDlmalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        (*ptr::addr_of_mut!(DLMALLOC)).malloc(layout.size(), layout.align())
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        (*ptr::addr_of_mut!(DLMALLOC)).free(pointer, layout.size(), layout.align());
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        (*ptr::addr_of_mut!(DLMALLOC)).calloc(layout.size(), layout.align())
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        (*ptr::addr_of_mut!(DLMALLOC)).realloc(pointer, layout.size(), layout.align(), new_size)
    }
}

#[global_allocator]
static GLOBAL_ALLOCATOR: GlobalChunkedDlmalloc = GlobalChunkedDlmalloc;
