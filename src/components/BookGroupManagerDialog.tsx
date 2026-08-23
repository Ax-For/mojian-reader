import { useEffect, useState } from 'react'
import { FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import type { BookGroup, ReaderBook } from '../types'

interface BookGroupManagerDialogProps {
  groups: BookGroup[]
  books: ReaderBook[]
  onClose: () => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function BookGroupManagerDialog({
  groups,
  books,
  onClose,
  onCreate,
  onRename,
  onDelete
}: BookGroupManagerDialogProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function createGroup(event: React.FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
  }

  return (
    <div className="library-dialog-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="library-dialog group-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="group-manager-title">
        <div className="library-dialog__heading group-manager-dialog__heading">
          <div>
            <p className="eyebrow">书架整理</p>
            <h2 id="group-manager-title">管理自建分组</h2>
            <span>一本书可以放入多个分组，删除分组不会删除书籍。</span>
          </div>
          <button className="dialog-close-button" type="button" aria-label="关闭分组管理" onClick={onClose}><X size={17} /></button>
        </div>

        <form className="group-create-form" onSubmit={createGroup}>
          <label>
            <span>新分组名称</span>
            <input
              aria-label="新分组名称"
              value={newName}
              maxLength={40}
              placeholder="例如：今年想读、工作参考"
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!newName.trim()}>
            <FolderPlus size={16} /> 创建分组
          </button>
        </form>

        <div className="group-manager-list" aria-label="已有自建分组">
          {groups.length > 0 ? groups.map((group) => {
            const bookCount = books.filter((book) => book.groupIds?.includes(group.id)).length
            const isEditing = editingId === group.id
            const isDeleteArmed = deleteArmedId === group.id
            return (
              <div className="group-manager-row" key={group.id}>
                {isEditing ? (
                  <div className="group-rename-form">
                    <input
                      autoFocus
                      aria-label="重命名分组"
                      value={editingName}
                      maxLength={40}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && editingName.trim()) {
                          onRename(group.id, editingName.trim())
                          setEditingId(null)
                        }
                      }}
                    />
                    <button type="button" disabled={!editingName.trim()} aria-label="保存重命名" onClick={() => {
                      onRename(group.id, editingName.trim())
                      setEditingId(null)
                    }}>保存</button>
                    <button type="button" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                ) : (
                  <>
                    <div className="group-manager-row__copy">
                      <strong>{group.name}</strong>
                      <span>{bookCount} 本书</span>
                    </div>
                    <div className="group-manager-row__actions">
                      <button type="button" aria-label={`重命名${group.name}`} onClick={() => {
                        setEditingId(group.id)
                        setEditingName(group.name)
                        setDeleteArmedId(null)
                      }}><Pencil size={15} /></button>
                      <button
                        className={isDeleteArmed ? 'group-delete-button group-delete-button--armed' : 'group-delete-button'}
                        type="button"
                        aria-label={isDeleteArmed ? `确认删除${group.name}` : `删除${group.name}`}
                        onClick={() => {
                          if (!isDeleteArmed) {
                            setDeleteArmedId(group.id)
                            return
                          }
                          onDelete(group.id)
                          setDeleteArmedId(null)
                        }}
                      ><Trash2 size={15} />{isDeleteArmed && <span>确认</span>}</button>
                    </div>
                  </>
                )}
              </div>
            )
          }) : (
            <div className="group-manager-empty">
              <FolderPlus size={20} />
              <strong>还没有自建分组</strong>
              <span>先创建一个，再从书籍的管理入口添加。</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
