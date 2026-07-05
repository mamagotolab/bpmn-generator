export const sampleFlow = {
  nodes: [
    { id: 'n1', type: 'start', label: '注文受付', lane: '顧客' },
    { id: 'n2', type: 'task', label: '注文内容確認', lane: '営業' },
    { id: 'n3', type: 'task', label: '在庫確認', lane: '営業' },
    { id: 'n4', type: 'gateway', label: '在庫有無', lane: '営業' },
    { id: 'n5', type: 'task', label: '出荷指示書作成', lane: '営業' },
    { id: 'n6', type: 'task', label: '発送', lane: '倉庫' },
    { id: 'n7', type: 'task', label: '納期遅延連絡', lane: '営業' },
    { id: 'n8', type: 'task', label: '発注', lane: '仕入' },
    { id: 'n9', type: 'task', label: '入荷確認', lane: '倉庫' },
    { id: 'n10', type: 'end', label: '完了', lane: '倉庫' }
  ],
  edges: [
    { from: 'n1', to: 'n2', label: '' },
    { from: 'n2', to: 'n3', label: '' },
    { from: 'n3', to: 'n4', label: '' },
    { from: 'n4', to: 'n5', label: '在庫あり' },
    { from: 'n5', to: 'n6', label: '' },
    { from: 'n4', to: 'n7', label: '在庫なし' },
    { from: 'n7', to: 'n8', label: '' },
    { from: 'n8', to: 'n9', label: '' },
    { from: 'n9', to: 'n6', label: '' },
    { from: 'n6', to: 'n10', label: '' }
  ]
};
