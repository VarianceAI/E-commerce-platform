import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost/api';

const CustomerDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('shop');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderMessage, setOrderMessage] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const suggestRef = useRef(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders();
    if (activeTab === 'notifications') fetchNotifications();
  }, [activeTab]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchProducts = async (page = 1) => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/products?page=${page}&limit=12`);
      setProducts(res.data.products || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (!searchQuery.trim()) return fetchProducts();
    try {
      setLoading(true);
      const res = await axios.get(`${API}/products/search?q=${encodeURIComponent(searchQuery)}`);
      setProducts(res.data.products || []);
      setPagination({ page: 1, pages: 1, total: res.data.products?.length || 0 });
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutocomplete = useCallback(async (value) => {
    setSearchQuery(value);
    if (value.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const res = await axios.get(`${API}/products/autocomplete?q=${encodeURIComponent(value)}`);
      setSuggestions(res.data.suggestions || []);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/orders/user/${user.id}`);
      setOrders(res.data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/notifications/notifications/user/${user.id}`);
      setNotifications(res.data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    const id = product._id || product.id;
    const existing = cart.find(i => (i.productId === id));
    if (existing) {
      setCart(cart.map(i => i.productId === id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, { productId: id, quantity: 1, price: product.price, name: product.name }]);
    }
  };

  const removeFromCart = (productId) => setCart(cart.filter(i => i.productId !== productId));

  const updateQty = (productId, qty) => {
    if (qty <= 0) return removeFromCart(productId);
    setCart(cart.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const createOrder = async () => {
    if (cart.length === 0) return;
    const total = cart.reduce((s, i) => s + i.quantity * i.price, 0);
    try {
      await axios.post(`${API}/orders`, {
        user_id: user.id,
        items: cart.map(i => ({ product_id: i.productId, quantity: i.quantity, unit_price: i.price })),
        total_amount: total
      });
      setOrderMessage('Order placed successfully!');
      setCart([]);
      setTimeout(() => setOrderMessage(''), 3000);
    } catch (err) {
      setOrderMessage('Error: ' + (err.response?.data?.error || 'Failed to place order'));
    }
  };

  const statusColor = (status) => {
    const map = { PENDING: '#f59e0b', PROCESSING: '#3b82f6', SHIPPED: '#8b5cf6', DELIVERED: '#10b981', CANCELLED: '#ef4444' };
    return map[status] || '#6b7280';
  };

  const cartTotal = cart.reduce((s, i) => s + i.quantity * i.price, 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Navbar */}
      <nav style={{ backgroundColor: '#1e3a5f', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '20px' }}>ShopNow</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {['shop', 'orders', 'notifications'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ background: activeTab === tab ? '#3b82f6' : 'transparent', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: activeTab === tab ? '600' : '400' }}
            >
              {tab === 'notifications' && notifications.length > 0 ? `Notifications (${notifications.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <span style={{ color: '#94a3b8', marginLeft: '12px', fontSize: '14px' }}>Hi, {user.name || user.email}!</span>
          <button onClick={() => { onLogout(); navigate('/login'); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>

        {/* ======== SHOP TAB ======== */}
        {activeTab === 'shop' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px' }}>
            <div>
              {/* Search bar with autocomplete */}
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '24px', position: 'relative' }} ref={suggestRef}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleAutocomplete(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Search products..."
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100 }}>
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          onClick={() => { setSearchQuery(s.text); setShowSuggestions(false); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '14px', borderBottom: i < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
                        >
                          {s.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Search</button>
                <button type="button" onClick={() => { setSearchQuery(''); fetchProducts(); }} style={{ padding: '10px 14px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Clear</button>
              </form>

              {/* Product grid */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading products...</div>
              ) : products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>No products found.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                    {products.map(product => {
                      const pid = product._id || product.id;
                      const inCart = cart.find(i => i.productId === pid);
                      return (
                        <div key={pid} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'}>
                          <div
                            onClick={() => setSelectedProduct(product)}
                            style={{ backgroundColor: '#f3f4f6', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', cursor: 'pointer' }}
                          >
                            📦
                          </div>
                          <div style={{ padding: '14px' }}>
                            <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                            {product.category && <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>{product.category}</div>}
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669', marginBottom: '12px' }}>${Number(product.price).toFixed(2)}</div>
                            {inCart ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button onClick={() => updateQty(pid, inCart.quantity - 1)} style={{ width: '28px', height: '28px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>−</button>
                                <span style={{ fontWeight: '600', minWidth: '20px', textAlign: 'center' }}>{inCart.quantity}</span>
                                <button onClick={() => updateQty(pid, inCart.quantity + 1)} style={{ width: '28px', height: '28px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>+</button>
                                <button onClick={() => removeFromCart(pid)} style={{ marginLeft: 'auto', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(product)} style={{ width: '100%', padding: '8px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                Add to Cart
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {pagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                      {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => fetchProducts(p)}
                          style={{ padding: '6px 12px', backgroundColor: p === pagination.page ? '#3b82f6' : '#e5e7eb', color: p === pagination.page ? '#fff' : '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Cart sidebar */}
            <div>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', position: 'sticky', top: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Cart ({cart.length} items)</h2>
                {orderMessage && (
                  <div style={{ padding: '10px', backgroundColor: orderMessage.startsWith('Error') ? '#fee2e2' : '#d1fae5', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', color: orderMessage.startsWith('Error') ? '#ef4444' : '#059669' }}>
                    {orderMessage}
                  </div>
                )}
                {cart.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '14px' }}>Your cart is empty</p>
                ) : (
                  <>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {cart.map((item) => (
                        <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.name}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.quantity} × ${item.price}</div>
                          </div>
                          <div style={{ fontWeight: '700', color: '#059669' }}>${(item.quantity * item.price).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
                        <span>Total</span>
                        <span style={{ color: '#059669' }}>${cartTotal.toFixed(2)}</span>
                      </div>
                      <button onClick={createOrder} style={{ width: '100%', padding: '12px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '16px' }}>
                        Place Order
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======== ORDERS TAB ======== */}
        {activeTab === 'orders' && (
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>My Orders</h1>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading orders...</div>
            ) : orders.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                <p style={{ fontSize: '16px' }}>No orders yet. Start shopping!</p>
                <button onClick={() => setActiveTab('shop')} style={{ marginTop: '16px', padding: '10px 24px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Browse Products</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {orders.map(order => (
                  <div key={order.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '16px' }}>Order #{order.id}</div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>{new Date(order.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ backgroundColor: statusColor(order.status) + '20', color: statusColor(order.status), padding: '4px 12px', borderRadius: '999px', fontWeight: '600', fontSize: '13px' }}>
                          {order.status}
                        </span>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: '#059669' }}>${Number(order.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======== NOTIFICATIONS TAB ======== */}
        {activeTab === 'notifications' && (
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>Notifications</h1>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
                <p>No notifications yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notifications.map((n, i) => (
                  <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '24px' }}>{n.type === 'OrderCreated' ? '🛍️' : n.type === 'PaymentCompleted' ? '✅' : '📢'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '15px' }}>{n.type}</div>
                      <div style={{ fontSize: '13px', color: '#374151', marginTop: '4px' }}>{n.message}</div>
                      {n.timestamp && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{new Date(n.timestamp).toLocaleString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setSelectedProduct(null)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '480px', width: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '64px', textAlign: 'center', marginBottom: '16px' }}>📦</div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>{selectedProduct.name}</h2>
            {selectedProduct.category && <div style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>{selectedProduct.category}</div>}
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669', marginBottom: '16px' }}>${Number(selectedProduct.price).toFixed(2)}</div>
            {selectedProduct.description && <p style={{ fontSize: '15px', color: '#374151', marginBottom: '20px', lineHeight: '1.6' }}>{selectedProduct.description}</p>}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}
                style={{ flex: 1, padding: '12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                Add to Cart
              </button>
              <button onClick={() => setSelectedProduct(null)}
                style={{ padding: '12px 20px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;
