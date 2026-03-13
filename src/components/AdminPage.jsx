export default function AdminPage({
  isMobileViewport,
  adminSection,
  setAdminSection,
  openAddUserModal,
  isUsersLoading,
  users,
  paginatedUsers,
  session,
  openEditUserModal,
  handleDeleteUser,
  userItemsPerPage,
  setUserItemsPerPage,
  userPageNumber,
  setUserPageNumber,
  userTotalPages,
  visibleUserPageNumbers,
  auditActionFilter,
  setAuditActionFilter,
  fetchAuditLogs,
  isAuditLoading,
  auditLogs,
  paginatedAuditLogs,
  formatDateTime,
  handleExportAuditCsv,
  auditItemsPerPage,
  setAuditItemsPerPage,
  auditPageNumber,
  setAuditPageNumber,
  auditTotalPages,
  visibleAuditPageNumbers,
  categorySectionContent,
  locationSectionContent,
  fetchCategories,
  fetchLocations,
  handleDownloadInventoryTemplateExcel,
  handleDownloadInventoryTemplateCsv,
  handleImportInventoryExcel,
  isInventoryImporting,
  inventoryImportMessage,
  inventoryImportError,
  handleExportInventoryExcel,
  handleExportInventoryCsv,
  inventoryLength,
}) {
  if (isMobileViewport) {
    return (
      <section className="controls">
        {adminSection === 'users' ? (
          <article className="panel controls">
            <div className="heading-row">
              <h2>User Management</h2>
              <button type="button" onClick={openAddUserModal}>
                Add User
              </button>
            </div>
            {isUsersLoading ? <p className="muted">Loading users...</p> : null}
            <div className="user-list">
              {users.length === 0 ? <p>No users found.</p> : null}
              {paginatedUsers.map((user) => (
                <article className="user-item" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <p className="muted">{user.email}</p>
                    <p>
                      <strong>Role:</strong> {user.role}
                    </p>
                    <p>
                      <strong>Status:</strong> {user.status}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => openEditUserModal(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {users.length > 0 ? (
              <div className="pagination-bar">
                {users.length > userItemsPerPage ? (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setUserPageNumber((previous) => Math.max(1, previous - 1))}
                      disabled={userPageNumber === 1}
                    >
                      Prev
                    </button>
                    <div className="pagination-pages">
                      {visibleUserPageNumbers.map((pageNumber) => (
                        <button
                          type="button"
                          key={pageNumber}
                          className={pageNumber === userPageNumber ? '' : 'ghost'}
                          onClick={() => setUserPageNumber(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setUserPageNumber((previous) => Math.min(userTotalPages, previous + 1))}
                      disabled={userPageNumber === userTotalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <label className="pagination-size">
                  Items per page
                  <select value={userItemsPerPage} onChange={(event) => setUserItemsPerPage(Number(event.target.value))}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={40}>40</option>
                    <option value={50}>50</option>
                    <option value={60}>60</option>
                    <option value={70}>70</option>
                    <option value={80}>80</option>
                    <option value={90}>90</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            ) : null}
          </article>
        ) : adminSection === 'audit' ? (
          <article className="panel controls">
            <div className="heading-row">
              <h2>Audit Logs</h2>
              <div className="actions">
                <select
                  value={auditActionFilter}
                  onChange={(event) => {
                    const nextAction = event.target.value;
                    setAuditActionFilter(nextAction);
                    fetchAuditLogs(nextAction);
                  }}
                >
                  <option value="all">All Actions</option>
                  <option value="user.login">User Login</option>
                  <option value="inventory.deactivate">Inventory Deactivate</option>
                  <option value="inventory.activate">Inventory Activate</option>
                  <option value="inventory.delete_permanent">Inventory Permanent Delete</option>
                </select>
                <button type="button" className="ghost" onClick={() => fetchAuditLogs(auditActionFilter)}>
                  Refresh
                </button>
                <button type="button" onClick={handleExportAuditCsv} disabled={auditLogs.length === 0}>
                  Export CSV
                </button>
              </div>
            </div>
            {isAuditLoading ? <p className="muted">Loading audit logs...</p> : null}
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    paginatedAuditLogs.map((log) => (
                      <tr key={log._id}>
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td>{log.action || 'N/A'}</td>
                        <td>{log.actor?.email || log.actor?.id || 'N/A'}</td>
                        <td>{log.target?.label || log.target?.id || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {auditLogs.length > 0 ? (
              <div className="pagination-bar">
                {auditLogs.length > auditItemsPerPage ? (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAuditPageNumber((previous) => Math.max(1, previous - 1))}
                      disabled={auditPageNumber === 1}
                    >
                      Prev
                    </button>
                    <div className="pagination-pages">
                      {visibleAuditPageNumbers.map((pageNumber) => (
                        <button
                          type="button"
                          key={pageNumber}
                          className={pageNumber === auditPageNumber ? '' : 'ghost'}
                          onClick={() => setAuditPageNumber(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAuditPageNumber((previous) => Math.min(auditTotalPages, previous + 1))}
                      disabled={auditPageNumber === auditTotalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <label className="pagination-size">
                  Items per page
                  <select value={auditItemsPerPage} onChange={(event) => setAuditItemsPerPage(Number(event.target.value))}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={40}>40</option>
                    <option value={50}>50</option>
                    <option value={60}>60</option>
                    <option value={70}>70</option>
                    <option value={80}>80</option>
                    <option value={90}>90</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            ) : null}
          </article>
        ) : adminSection === 'locations' ? (
          locationSectionContent
        ) : (
          categorySectionContent
        )}
      </section>
    );
  }

  return (
    <section className="admin-layout">
      <aside className="panel admin-sidebar" aria-label="Admin navigation">
        <h2>Admin</h2>
        <nav className="admin-sidebar-nav">
          <button type="button" className={adminSection === 'users' ? 'active' : ''} onClick={() => setAdminSection('users')}>
            Users
          </button>
          <button type="button" className={adminSection === 'audit' ? 'active' : ''} onClick={() => setAdminSection('audit')}>
            Audit Trail
          </button>
          <button
            type="button"
            className={adminSection === 'categories' ? 'active' : ''}
            onClick={() => {
              setAdminSection('categories');
              fetchCategories();
            }}
          >
            Categories
          </button>
          <button
            type="button"
            className={adminSection === 'locations' ? 'active' : ''}
            onClick={() => {
              setAdminSection('locations');
              fetchLocations();
            }}
          >
            Locations
          </button>
          <button
            type="button"
            className={adminSection === 'inventory_excel' ? 'active' : ''}
            onClick={() => setAdminSection('inventory_excel')}
          >
            Inventory Excel
          </button>
        </nav>
      </aside>

      <section className="admin-content">
        {adminSection === 'users' ? (
          <article className="panel controls">
            <div className="heading-row">
              <h2>User Management</h2>
              <button type="button" onClick={openAddUserModal}>
                Add User
              </button>
            </div>
            {isUsersLoading ? <p className="muted">Loading users...</p> : null}
            <div className="user-list">
              {users.length === 0 ? <p>No users found.</p> : null}
              {paginatedUsers.map((user) => (
                <article className="user-item" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <p className="muted">{user.email}</p>
                    <p>
                      <strong>Role:</strong> {user.role}
                    </p>
                    <p>
                      <strong>Status:</strong> {user.status}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => openEditUserModal(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={user.role === 'super admin' && session?.role !== 'super admin'}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {users.length > 0 ? (
              <div className="pagination-bar">
                {users.length > userItemsPerPage ? (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setUserPageNumber((previous) => Math.max(1, previous - 1))}
                      disabled={userPageNumber === 1}
                    >
                      Prev
                    </button>
                    <div className="pagination-pages">
                      {visibleUserPageNumbers.map((pageNumber) => (
                        <button
                          type="button"
                          key={pageNumber}
                          className={pageNumber === userPageNumber ? '' : 'ghost'}
                          onClick={() => setUserPageNumber(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setUserPageNumber((previous) => Math.min(userTotalPages, previous + 1))}
                      disabled={userPageNumber === userTotalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <label className="pagination-size">
                  Items per page
                  <select value={userItemsPerPage} onChange={(event) => setUserItemsPerPage(Number(event.target.value))}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={40}>40</option>
                    <option value={50}>50</option>
                    <option value={60}>60</option>
                    <option value={70}>70</option>
                    <option value={80}>80</option>
                    <option value={90}>90</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            ) : null}
          </article>
        ) : adminSection === 'audit' ? (
          <article className="panel controls">
            <div className="heading-row">
              <h2>Audit Trail</h2>
              <div className="actions">
                <select
                  value={auditActionFilter}
                  onChange={(event) => {
                    const nextAction = event.target.value;
                    setAuditActionFilter(nextAction);
                    fetchAuditLogs(nextAction);
                  }}
                >
                  <option value="all">All Actions</option>
                  <option value="user.login">User Login</option>
                  <option value="inventory.deactivate">Inventory Deactivate</option>
                  <option value="inventory.activate">Inventory Activate</option>
                  <option value="inventory.delete_permanent">Inventory Permanent Delete</option>
                </select>
                <button type="button" className="ghost" onClick={() => fetchAuditLogs(auditActionFilter)}>
                  Refresh
                </button>
                <button type="button" onClick={handleExportAuditCsv} disabled={auditLogs.length === 0}>
                  Export CSV
                </button>
              </div>
            </div>
            {isAuditLoading ? <p className="muted">Loading audit logs...</p> : null}
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    paginatedAuditLogs.map((log) => (
                      <tr key={log._id}>
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td>{log.action || 'N/A'}</td>
                        <td>{log.actor?.email || log.actor?.id || 'N/A'}</td>
                        <td>{log.target?.label || log.target?.id || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {auditLogs.length > 0 ? (
              <div className="pagination-bar">
                {auditLogs.length > auditItemsPerPage ? (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAuditPageNumber((previous) => Math.max(1, previous - 1))}
                      disabled={auditPageNumber === 1}
                    >
                      Prev
                    </button>
                    <div className="pagination-pages">
                      {visibleAuditPageNumbers.map((pageNumber) => (
                        <button
                          type="button"
                          key={pageNumber}
                          className={pageNumber === auditPageNumber ? '' : 'ghost'}
                          onClick={() => setAuditPageNumber(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAuditPageNumber((previous) => Math.min(auditTotalPages, previous + 1))}
                      disabled={auditPageNumber === auditTotalPages}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <div />
                )}
                <label className="pagination-size">
                  Items per page
                  <select value={auditItemsPerPage} onChange={(event) => setAuditItemsPerPage(Number(event.target.value))}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={40}>40</option>
                    <option value={50}>50</option>
                    <option value={60}>60</option>
                    <option value={70}>70</option>
                    <option value={80}>80</option>
                    <option value={90}>90</option>
                    <option value={100}>100</option>
                  </select>
                </label>
              </div>
            ) : null}
          </article>
        ) : adminSection === 'categories' ? (
          categorySectionContent
        ) : adminSection === 'locations' ? (
          locationSectionContent
        ) : (
          <article className="panel controls">
            <div className="heading-row">
              <h2>Inventory Excel</h2>
            </div>
            <p className="muted">
              Import inventory from Excel or export the current inventory to an Excel file.
            </p>
            <div className="inventory-excel-grid">
              <div className="inventory-excel-card">
                <h3>Import Inventory</h3>
                <p className="muted">
                  Upload an Excel or CSV file with columns like Database ID, Inventory ID, Title, Artist, Category, Place, and Price.
                </p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={handleDownloadInventoryTemplateExcel}>
                    Download Excel Template
                  </button>
                  <button type="button" className="ghost" onClick={handleDownloadInventoryTemplateCsv}>
                    Download CSV Template
                  </button>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportInventoryExcel}
                  disabled={isInventoryImporting}
                />
                {inventoryImportMessage ? <p className="muted">{inventoryImportMessage}</p> : null}
                {inventoryImportError ? <p className="form-error">{inventoryImportError}</p> : null}
              </div>
              <div className="inventory-excel-card">
                <h3>Export Inventory</h3>
                <p className="muted">
                  Download the current inventory list as an Excel file for backup or bulk editing.
                </p>
                <div className="actions">
                  <button type="button" onClick={handleExportInventoryExcel} disabled={inventoryLength === 0}>
                    Export Excel
                  </button>
                  <button type="button" className="ghost" onClick={handleExportInventoryCsv} disabled={inventoryLength === 0}>
                    Export CSV
                  </button>
                </div>
              </div>
            </div>
          </article>
        )}
      </section>
    </section>
  );
}
