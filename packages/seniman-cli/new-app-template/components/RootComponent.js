import { _createBlock, _createComponent, onCleanup, WindowProvider, useWindow, _declareBlock, createSignal, createMemo, onError } from 'seniman';

function NotFoundPage() {
    return <div>404</div>;
}

function HomePage() {
    return <div>Home</div>;
}

function ProductPage() {
    return <div>Product</div>;
}

function SearchPage() {
    return <div>Search</div>;
}

function CategoryPage() {
    return <div>Category</div>;
}

export default function RootComponent(props) {
    // let window = useWindow();
    let window = useWindow();

    return () => {
        let path = window.path();

        if (path == '/') {
            return <HomePage />;
        } else if (path == '/product') {
            return <ProductPage />;
        } else if (path == '/search') {
            return <SearchPage />;
        } else if (path == '/category') {
            return <CategoryPage />;
        } else {
            return <NotFoundPage />;
        }
    }
};