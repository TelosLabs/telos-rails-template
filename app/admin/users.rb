# frozen_string_literal: true

ActiveAdmin.register(User) do
  permit_params :email, :password, :password_confirmation, :admin

  index do
    selectable_column
    id_column
    column :email
    column :admin
    column :confirmed_at
    column :created_at
    actions
  end

  filter :email
  filter :admin
  filter :created_at

  form do |f|
    f.inputs do
      f.input(:email)
      f.input(:password)
      f.input(:password_confirmation)
      f.input(:admin)
    end
    f.actions
  end

  show do
    attributes_table do
      row :id
      row :email
      row :admin
      row :confirmed_at
      row :confirmation_sent_at
      row :created_at
      row :updated_at
    end
  end
end
