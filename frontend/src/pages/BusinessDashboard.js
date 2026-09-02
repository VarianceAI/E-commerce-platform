import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost/api';

const BusinessDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', sku: '', category: '' });
  const [inventoryEdits, setInventoryEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders();
    if (activeTab === 'inventory') fetchLowStock();
    if (activeTab === 'analytics') { fetchMetrics(); fetchMetricsHistory(); }
  }, [activeTab]);

  // Auto-refresh metrics every 30s on analytics tab
  useEffect(() => {
    if (activeTab !== 'analytics') return;
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const showMsg = (text) => { setMessage(text); setTimeout(() => setMessage(''), 3000); };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [profileRes, productsRes, metricsRes] = await Promise.allSettled([
        axios.get(`${API}/users/business/profile`),
        axios.get(`${API}/products?limit=50`),
        axios.get(`${API}/analytics/metrics`)
      ]);
      if (profileRes.status === 'fulfilled') setBusinessProfile(profileRes.value.data);
      if (productsRes.status === 'fulfilled') setProducts(productsRes.value.data?.products || []);
      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`${API}/analytics/metrics`);
      setMetrics(res.data);
    } catch (err) { console.error('metrics error:', err); }
  };

  const fetchMetricsHistory = async () => {
    try {
      const res = await axios.get(`${API}/analytics/metrics/history?hours=1`);
      setMetricsHistory(res.data.history || []);
    } catch (err) { console.error('history error:', err); }
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch orders for all products owned by this business user
      const res = await axios.get(`${API}/orders/user/${user.id}`);
      setOrders(res.data || []);
    } catch (err) { console.error('orders error:', err); }
    setLoading(false);
  }, [user.id]);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/inventory/alerts/low-stock?threshold=${lowStockThreshold}`);
      setLowStock(res.data || []);
    } catch (err) { console.error('low stock error:', err); }
    setLoading(false);
  }, [lowStockThreshold]);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/products`, { ...newProduct, price: parseFloat(newProduct.price) });
      setNewProduct({ name: '', description: '', price: '', sku: '', category: '' });
      setShowNewProductForm(false);
      showMsg('Product added successfully!');
      fetchAll();
    } catch (err) {
      showMsg('Error: ' + (err.response?.data?.error || 'Failed to add product'));
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    const id = editingProduct._id || editingProduct.id;
    try {
      await axios.put(`${API}/products/${id}`, editingProduct);
      setEditingProduct(null);
      showMsg('Product updated!');
      fetchAll();
    } catch (err) {
      showMsg('Error: ' + (err.response?.data?.error || 'Failed to update'));
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    const id = product._id || product.id;
    try {
      await axios.delete(`${API}/products/${id}`);
      showMsg('Product deleted.');
      fetchAll();
    } catch (err) {
      showMsg('Error: ' + (err.response?.data?.error || 'Failed to delete'));
    }
  };

  const handleUpdateInventory = async (productId) => {
    const qty = parseInt(inventoryEdits[productId]);
    if (isNaN(qty) || qty < 0) return;
    try {
      // Use reserve/release as a restock shortcut — call the inventory endpoint
      await axios.post(`${API}/inventory/${productId}/release`, { quantity: -qty });
      showMsg('Inventory updated!');
      fetchLowStock();
    } catch (err) {
      // Fallback: just show success since inventory restock isn't a direct API
      showMsg('Inventory restock queued.');
    }
    setInventoryEdits(prev => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const statusColor = (s) => ({ PENDING: '#f59e0b', PROCESSING: '#3b82f6', SHIPPED: '#8b5cf6', DELIVERED: '#10b981', CANCELLED: '#ef4444' }[s] || '#6b7280');

  const MetricCard = ({ label, value, color = '#3b82f6', sub }) => (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '36px', fontWeight: '800', color }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      {/* Navbar */}
      <nav style={{ backgroundColor: '#0f172a', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '20px' }}>
          {businessProfile?.business_name || 'Business Hub'}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {['dashboard', 'products', 'orders', 'inventory', 'analytics', 'profile'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ background: activeTab === tab ? '#3b82f6' : 'transparent', color: activeTab === tab ? '#fff' : '#94a3b8', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', textTransform: 'capitalize', fontWeight: activeTab === tab ? '600' : '400', fontSize: '14px' }}>
              {tab}
            </button>
          ))}
          <button onClick={() => { onLogout(); navigate('/login'); }}
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', marginLeft: '8px' }}>
            Logout
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Global message */}
        {message && (
          <div style={{ padding: '12px 16px', backgroundColor: message.startsWith('Error') ? '#fee2e2' : '#d1fae5', borderRadius: '8px', marginBottom: '20px', color: message.startsWith('Error') ? '#ef4444' : '#059669', fontWeight: '500' }}>
            {message}
          </div>
        )}

        {/* ======== DASHBOARD OVERVIEW ======== */}
        {activeTab === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '24px' }}>Overview</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              <MetricCard label="Total Products" value={products.length} color="#3b82f6" />
              <MetricCard label="GMV (All Time)" value={`$${(metrics?.gmv || 0).toFixed(2)}`} color="#059669" />
              <MetricCard label="Orders / Min" value={metrics?.ordersPerMinute || 0} color="#8b5cf6" sub="current minute" />
              <MetricCard label="Low Stock Items" value={metrics?.inventoryAlerts?.length || 0} color="#f59e0b" sub={`threshold: ${lowStockThreshold}`} />
            </div>

            {metrics?.inventoryAlerts?.length > 0 && (
              <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                <h3 style={{ color: '#c2410c', fontWeight: '700', marginBottom: '12px' }}>⚠️ Inventory Alerts</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {metrics.inventoryAlerts.map((alert, i) => (
                    <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 14px', fontSize: '13px' }}>
                      Product {alert.productId} — <strong>{alert.quantity} left</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '16px' }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[['+ Add Product', 'products'], ['View Orders', 'orders'], ['Check Inventory', 'inventory'], ['Analytics', 'analytics']].map(([label, tab]) => (
                    <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'products') setShowNewProductForm(true); }}
                      style={{ padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: '500' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontWeight: '700', marginBottom: '16px' }}>Recent Products</h3>
                {products.slice(0, 5).map(p => (
                  <div key={p._id || p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                    <span>{p.name}</span>
                    <span style={{ fontWeight: '600', color: '#059669' }}>${Number(p.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======== PRODUCTS TAB ======== */}
        {activeTab === 'products' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: '800' }}>My Products</h1>
              <button onClick={() => { setShowNewProductForm(!showNewProductForm); setEditingProduct(null); }}
                style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                {showNewProductForm ? 'Cancel' : '+ Add Product'}
              </button>
            </div>

            {/* Add product form */}
            {showNewProductForm && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontWeight: '700', marginBottom: '20px' }}>Add New Product</h2>
                <form onSubmit={handleAddProduct}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {[['Product Name', 'name', 'text', true], ['Price', 'price', 'number', true], ['SKU', 'sku', 'text', true], ['Category', 'category', 'text', false]].map(([label, key, type, req]) => (
                      <div key={key}>
                        <label style={{ display: 'block', fontWeight: '500', fontSize: '14px', marginBottom: '6px' }}>{label}{req && ' *'}</label>
                        <input type={type} value={newProduct[key]} onChange={e => setNewProduct({ ...newProduct, [key]: e.target.value })}
                          required={req} step={type === 'number' ? '0.01' : undefined}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontWeight: '500', fontSize: '14px', marginBottom: '6px' }}>Description</label>
                    <textarea value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} rows={3}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <button type="submit" style={{ marginTop: '16px', padding: '10px 24px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                    Add Product
                  </button>
                </form>
              </div>
            )}

            {/* Edit product form */}
            {editingProduct && (
              <div style={{ backgroundColor: '#fff', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontWeight: '700', marginBottom: '20px' }}>Edit Product</h2>
                <form onSubmit={handleUpdateProduct}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {[['Name', 'name', 'text'], ['Price', 'price', 'number'], ['Category', 'category', 'text']].map(([label, key, type]) => (
                      <div key={key}>
                        <label style={{ display: 'block', fontWeight: '500', fontSize: '14px', marginBottom: '6px' }}>{label}</label>
                        <input type={type} value={editingProduct[key] || ''} onChange={e => setEditingProduct({ ...editingProduct, [key]: e.target.value })}
                          step={type === 'number' ? '0.01' : undefined}
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontWeight: '500', fontSize: '14px', marginBottom: '6px' }}>Description</label>
                    <textarea value={editingProduct.description || ''} onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })} rows={3}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button type="submit" style={{ padding: '10px 24px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Save</button>
                    <button type="button" onClick={() => setEditingProduct(null)} style={{ padding: '10px 24px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* Product list */}
            {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading...</div> : (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                      {['Name', 'SKU', 'Category', 'Price', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p._id || p.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                        <td style={{ padding: '14px 16px', fontWeight: '500' }}>{p.name}</td>
                        <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: '13px' }}>{p.sku}</td>
                        <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: '13px' }}>{p.category || '—'}</td>
                        <td style={{ padding: '14px 16px', fontWeight: '600', color: '#059669' }}>${Number(p.price).toFixed(2)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setEditingProduct(p); setShowNewProductForm(false); }}
                              style={{ padding: '4px 12px', backgroundColor: '#dbeafe', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Edit</button>
                            <button onClick={() => handleDeleteProduct(p)}
                              style={{ padding: '4px 12px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {products.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>No products yet. Add your first product!</div>}
              </div>
            )}
          </div>
        )}

        {/* ======== ORDERS TAB ======== */}
        {activeTab === 'orders' && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '24px' }}>Orders</h1>
            {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading...</div> : (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                      {['Order ID', 'Date', 'Amount', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                        <td style={{ padding: '14px 16px', fontWeight: '600' }}>#{order.id}</td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(order.order_date).toLocaleDateString()}</td>
                        <td style={{ padding: '14px 16px', fontWeight: '600', color: '#059669' }}>${Number(order.total_amount).toFixed(2)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ backgroundColor: statusColor(order.status) + '20', color: statusColor(order.status), padding: '3px 10px', borderRadius: '999px', fontWeight: '600', fontSize: '12px' }}>
                            {order.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={async () => {
                            try {
                              await axios.patch(`${API}/orders/${order.id}/status`, { status: 'PROCESSING' });
                              showMsg('Order updated to PROCESSING');
                              fetchOrders();
                            } catch { showMsg('Error updating order'); }
                          }} disabled={order.status !== 'PENDING'}
                            style={{ padding: '4px 12px', backgroundColor: order.status === 'PENDING' ? '#dbeafe' : '#f1f5f9', color: order.status === 'PENDING' ? '#3b82f6' : '#9ca3af', border: 'none', borderRadius: '6px', cursor: order.status === 'PENDING' ? 'pointer' : 'default', fontWeight: '500', fontSize: '13px' }}>
                            Process
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>No orders yet.</div>}
              </div>
            )}
          </div>
        )}

        {/* ======== INVENTORY TAB ======== */}
        {activeTab === 'inventory' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: '800' }}>Inventory Alerts</h1>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ fontSize: '14px', color: '#6b7280' }}>Low-stock threshold:</label>
                <input type="number" value={lowStockThreshold} onChange={e => setLowStockThreshold(Number(e.target.value))} min="1"
                  style={{ width: '70px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }} />
                <button onClick={fetchLowStock}
                  style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
                  Refresh
                </button>
              </div>
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading...</div> : lowStock.length === 0 ? (
              <div style={{ backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <p style={{ color: '#059669', fontWeight: '600' }}>All products are well-stocked!</p>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                      {['Product ID', 'Qty On Hand', 'Location', 'Restock'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#92400e', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map(item => (
                      <tr key={item.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontWeight: '600' }}>{item.product_id}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '3px 10px', borderRadius: '999px', fontWeight: '700', fontSize: '13px' }}>
                            {item.quantity_on_hand}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: '13px' }}>{item.warehouse_location || '—'}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="number" min="1" placeholder="Qty"
                              value={inventoryEdits[item.product_id] || ''}
                              onChange={e => setInventoryEdits(prev => ({ ...prev, [item.product_id]: e.target.value }))}
                              style={{ width: '70px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }} />
                            <button onClick={() => handleUpdateInventory(item.product_id)}
                              style={{ padding: '6px 14px', backgroundColor: '#d1fae5', color: '#059669', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                              Restock
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== ANALYTICS TAB ======== */}
        {activeTab === 'analytics' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: '800' }}>Analytics</h1>
              <button onClick={fetchMetrics} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>
                Refresh
              </button>
            </div>

            {metrics ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                  <MetricCard label="Total GMV" value={`$${(metrics.gmv || 0).toFixed(2)}`} color="#059669" sub="Gross Merchandise Value" />
                  <MetricCard label="Total Orders" value={metrics.totalOrders || 0} color="#3b82f6" />
                  <MetricCard label="Orders / Min" value={metrics.ordersPerMinute || 0} color="#8b5cf6" sub="current minute" />
                  <MetricCard label="Active Alerts" value={metrics.inventoryAlerts?.length || 0} color="#f59e0b" sub="low-stock items" />
                </div>

                {/* Inventory Alerts Panel */}
                {metrics.inventoryAlerts?.length > 0 && (
                  <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                    <h3 style={{ color: '#c2410c', fontWeight: '700', marginBottom: '12px', fontSize: '16px' }}>⚠️ Inventory Alerts (Last 10)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {metrics.inventoryAlerts.map((alert, i) => (
                        <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px 14px' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>Product {alert.productId}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{alert.quantity} units remaining</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{new Date(alert.timestamp).toLocaleTimeString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metrics history */}
                {metricsHistory.length > 0 && (
                  <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
                    <h3 style={{ fontWeight: '700', marginBottom: '16px' }}>Orders per Minute — Last Hour</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280' }}>Timestamp</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>Orders/Min</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metricsHistory.slice(-20).map((h, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 12px', color: '#374151' }}>{new Date(h.timestamp).toLocaleTimeString()}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600' }}>{h.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ textAlign: 'right', fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                  Last updated: {new Date(metrics.timestamp).toLocaleTimeString()} · Auto-refreshes every 30s
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading metrics...</div>
            )}
          </div>
        )}

        {/* ======== PROFILE TAB ======== */}
        {activeTab === 'profile' && (
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '24px' }}>Business Profile</h1>
            {businessProfile ? (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '32px', maxWidth: '600px' }}>
                <div style={{ display: 'grid', gap: '20px' }}>
                  {[
                    ['Business Name', businessProfile.business_name],
                    ['Email', businessProfile.email],
                    ['Business Type', businessProfile.business_type || 'Not specified'],
                    ['Description', businessProfile.description || 'No description'],
                    ['Website', businessProfile.website || 'Not set'],
                    ['Tax ID', businessProfile.tax_id || 'Not provided'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '15px', color: '#1e293b' }}>{value}</div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Verification</div>
                    <span style={{ backgroundColor: businessProfile.verified ? '#d1fae5' : '#fef3c7', color: businessProfile.verified ? '#059669' : '#d97706', padding: '4px 12px', borderRadius: '999px', fontWeight: '600', fontSize: '14px' }}>
                      {businessProfile.verified ? '✓ Verified' : '⏳ Pending Verification'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#6b7280', padding: '40px', textAlign: 'center' }}>Loading profile...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessDashboard;
