---
title: 排序整理
date: 2026-04-08
categories: code
mathjax: true
---

<!-- more -->

## 排序定义

设${R_0,R_1,…,R_{n-1}} $是由$n$个记录组成的文件，
${K*0,K_1,…,K*{n-1}}$ 是排序码集合，
排序是将记录按排序码非递增(或非递减)的次序排列

## 一些判断标准

稳定：经过排序后记录的相对次序保持不变，则这种排序方法称为是“稳定的”

评价排序算法好坏的标准：时间、附加空间、算法本身的复杂程度

基本操作：比较和移动

### 插入排序

时间：O(n2)
空间：O(1)
稳定性：稳定

改进：二分法插入排序、表插入排序、 Shell排序（O(n1.3)）

### 选择排序

时间：O(n2)
空间：O(1)
稳定性：不稳定

### 堆排序

时间：O(nlog2n)
空间：O(1)
稳定性：不稳定

```
#include <bits/stdc++.h>
using namespace std;
int n,arr[100005];
void sift_down(int u,int siz){
	while (u*2<=siz){
		int v=u*2;
		if (v+1<=siz&&arr[v+1]>arr[v]) v++;
		if (arr[v]<=arr[u]) break;
		swap(arr[u],arr[v]);
		u=v;
	}
}
void make_heap(){
	for (int i=n/2;i>=1;--i) sift_down(i,n);
}
void heap_sort(){
	for (int i=n;i>=1;--i){
		swap(arr[1],arr[i]);
		sift_down(1,i-1);
	}
}
int main(){
	scanf("%d",&n);
	for (int i=1;i<=n;++i) scanf("%d",&arr[i]);
	make_heap();
	heap_sort();
	for (int i=1;i<=n;++i) printf("%d ",arr[i]);
	return 0;
}
```

### 快速排序

时间：O(nlog2n)
空间：O(log2n)
稳定性：不稳定

```
#include <bits/stdc++.h>
using namespace std;
int a[100005],n;
void Sort(int *a,int l,int r){
	if (l>=r) return;
	int i=l,j=r,temp=a[l];
	while (i!=j){
		while (a[j]>=temp&&i<j) j--;
		if (i<j) swap(a[i++],a[j]);
		while (a[i]<=temp&&i<j) i++;
		if (i<j) swap(a[i],a[j--]);
	}
	a[i]=temp;
	Sort(a,l,i-1);
	Sort(a,i+1,r);
}
int main(){
	scanf("%d",&n);
	for (int i=1;i<=n;++i) scanf("%d",&a[i]);
	Sort(a,1,n);
	for (int i=1;i<=n;++i) printf("%d ",a[i]);
	return 0;
}
```
